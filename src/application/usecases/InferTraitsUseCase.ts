import type { IExperienceRepository } from '@/core/domains/experience/IExperienceRepository';
import type { IClusterQueryRepository } from '@/core/domains/cluster/IClusterQueryRepository';
import type { ITraitRepository } from '@/core/domains/trait/ITraitRepository';
import type { IPersonaRepository } from '@/core/domains/persona/IPersonaRepository';
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
    try {
      const { text } = await this.retry.execute(() =>
        this.llm.generate(TRAIT_SYSTEM_PROMPT, userMessage, 256),
      );
      traitScores = this.validator.validateTraitResponse(text) ?? buildFallbackTraits(clusters);
    } catch (err) {
      logger.warn('infer:llm_failed', { userId, err });
      traitScores = buildFallbackTraits(clusters);
    }

    await this.traitRepo.save(userId, traitScores);

    const traitsHash = JSON.stringify(Object.entries(traitScores).sort());
    const personaJson = buildPersonaJson(traitScores, clusters, experiences);
    try {
      await this.personaRepo.saveSnapshot(userId, personaJson, traitsHash);
    } catch (err) {
      logger.warn('infer:snapshot_failed', { userId, err });
    }

    return { traits: traitScores };
  }
}
