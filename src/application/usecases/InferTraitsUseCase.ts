import type { IExperienceRepository } from '@/core/domains/experience/IExperienceRepository';
import type { IClusterQueryRepository } from '@/core/domains/cluster/IClusterQueryRepository';
import type { ITraitRepository } from '@/core/domains/trait/ITraitRepository';
import type { IPersonaRepository } from '@/core/domains/persona/IPersonaRepository';
import type { IPsychologyRepository } from '@/core/ports/IPsychologyRepository';
import type { ILLMPort } from '@/application/ports/ILLMPort';
import type { LLMRetryPolicy } from '@/application/llm/policies/LLMRetryPolicy';
import type { LLMResponseValidator } from '@/application/llm/policies/LLMResponseValidator';
import { TRAIT_SYSTEM_PROMPT, buildTraitUserMessage } from '@/application/llm/traitInferencePrompt';
import { buildFallbackTraits } from '@/core/domains/trait/Trait';
import { buildPersonaJson } from '@/core/domains/persona/Persona';
import type { TraitName } from '@/types';
import { logger } from '@/infrastructure/observability/logger';

export class InferTraitsUseCase {
  constructor(
    private readonly expRepo: IExperienceRepository,
    private readonly clusterQuery: IClusterQueryRepository,
    private readonly traitRepo: ITraitRepository,
    private readonly personaRepo: IPersonaRepository,
    private readonly psychologyRepo: IPsychologyRepository,
    private readonly llm: ILLMPort,
    private readonly retry: LLMRetryPolicy,
    private readonly validator: LLMResponseValidator,
  ) {}

  async execute(userId: string): Promise<{ traits: Record<TraitName, number> }> {
    const [clusters, experiences] = await Promise.all([
      this.clusterQuery.findByUser(userId),
      this.expRepo.findRecent(userId, 20),
    ]);

    const userMessage = buildTraitUserMessage(clusters, experiences);

    let traitScores: Record<TraitName, number>;
    let llmText: string | null = null;
    try {
      const { text } = await this.retry.execute(() =>
        this.llm.generate(TRAIT_SYSTEM_PROMPT, userMessage, 1024),
      );
      llmText = text;
      traitScores = this.validator.validateTraitResponse(text) ?? buildFallbackTraits(clusters);
    } catch (err) {
      logger.warn('infer:llm_failed', { userId, err });
      traitScores = buildFallbackTraits(clusters);
    }

    // 既存のtraitsテーブルへの書き込み（後方互換）
    await this.traitRepo.save(userId, traitScores);

    const traitsHash = JSON.stringify(Object.entries(traitScores).sort());
    const personaJson = buildPersonaJson(traitScores, clusters, experiences);
    try {
      await this.personaRepo.saveSnapshot(userId, personaJson, traitsHash);
    } catch (err) {
      logger.warn('infer:snapshot_failed', { userId, err });
    }

    // Big Five スコアを big_five_scores テーブルに保存
    if (llmText) {
      const bigFiveResult = this.validator.validateBigFiveResponse(llmText);
      if (bigFiveResult) {
        try {
          await this.psychologyRepo.upsertBigFiveScore({
            userId,
            openness: bigFiveResult.bigFive.openness,
            conscientiousness: bigFiveResult.bigFive.conscientiousness,
            extraversion: bigFiveResult.bigFive.extraversion,
            agreeableness: bigFiveResult.bigFive.agreeableness,
            neuroticism: bigFiveResult.bigFive.neuroticism,
            confidence: bigFiveResult.bigFive.confidence,
            evidenceCount: experiences.length,
            applyCulturalAdjustment: true,
          });

          for (const facet of bigFiveResult.facets) {
            await this.psychologyRepo.upsertBigFiveFacet({
              userId,
              domain: facet.domain,
              facetName: facet.facetName,
              score: facet.score,
              confidence: facet.confidence,
            });
          }

          if (bigFiveResult.attachmentHints) {
            const { anxietyScore, avoidanceScore } = bigFiveResult.attachmentHints;
            if (anxietyScore !== null || avoidanceScore !== null) {
              await this.psychologyRepo.upsertAttachmentProfile({
                userId,
                anxietyScore: anxietyScore ?? undefined,
                avoidanceScore: avoidanceScore ?? undefined,
                confidence: bigFiveResult.bigFive.confidence,
                evidenceCount: experiences.length,
              });
            }
          }

          for (const is_ of bigFiveResult.identityStatus) {
            await this.psychologyRepo.upsertIdentityStatus({
              userId,
              domain: is_.domain,
              explorationScore: is_.explorationScore,
              commitmentScore: is_.commitmentScore,
            });
          }
        } catch (err) {
          logger.warn('infer:big_five_save_failed', { userId, err });
        }
      }
    }

    return { traits: traitScores };
  }
}
