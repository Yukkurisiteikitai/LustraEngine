import type { IExperienceRepository } from '@/core/domains/experience/IExperienceRepository';
import type { IClusterQueryRepository } from '@/core/domains/cluster/IClusterQueryRepository';
import type { ITraitHypothesisRepository } from '@/core/domains/trait/ITraitHypothesisRepository';
import type { ExperienceData } from '@/core/domains/experience/Experience';
import type { ClusterData } from '@/core/domains/cluster/Cluster';
import type { ILLMPort } from '@/application/ports/ILLMPort';
import type { ILoggerPort } from '@/application/ports/ILoggerPort';
import type { LLMRetryPolicy } from '@/application/llm/policies/LLMRetryPolicy';
import type { LLMResponseValidator, BigFiveResponse } from '@/application/llm/policies/LLMResponseValidator';
import type { AnalysisContext } from '@/application/analysis/AnalysisContextService';
import { TRAIT_SYSTEM_PROMPT, buildTraitUserMessage } from '@/application/llm/traitInferencePrompt';
import { buildFallbackTraits } from '@/core/domains/trait/Trait';
import type { TraitName } from '@/types';
import { randomUUID } from 'node:crypto';
import type {
  TraitHypothesisInsert,
  TraitHypothesisRecord,
  TraitHypothesisResult,
} from '@/core/domains/trait/TraitHypothesis';
import type { IUserSettingsRepository } from '@/core/domains/user-settings/IUserSettingsRepository';

function deriveLegacyTraitsFromBigFive(bf: BigFiveResponse['bigFive']): Record<TraitName, number> {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  return {
    introversion:   clamp(1 - bf.extraversion),
    discipline:     clamp(bf.conscientiousness),
    curiosity:      clamp(bf.openness),
    risk_tolerance: clamp(1 - bf.neuroticism * 0.6 + bf.extraversion * 0.2),
    self_criticism: clamp(bf.neuroticism),
    social_anxiety: clamp(bf.neuroticism * 0.5 + (1 - bf.extraversion) * 0.5),
  };
}

function scoreLabel(score: number): string {
  if (score >= 0.67) return 'high';
  if (score <= 0.33) return 'low';
  return 'medium';
}

function buildHypothesisText(traitKey: TraitName, score: number): string {
  const labels: Record<TraitName, string> = {
    introversion: '内向性',
    discipline: '自律性',
    curiosity: '好奇心',
    risk_tolerance: 'リスク許容度',
    self_criticism: '自己批判',
    social_anxiety: '社会不安',
  };

  const tendency = scoreLabel(score) === 'high' ? '高め' : scoreLabel(score) === 'low' ? '低め' : '中程度';
  return `現時点のログ上、${labels[traitKey]}が${tendency}という仮説があります。`;
}

function buildHypotheses(
  userId: string,
  traitScores: Record<TraitName, number>,
  evidenceIds: string[],
  patternIds: string[],
  modelName: string,
  modelVersion: string,
  promptVersion: string,
  confidence: number,
  analysisJobId?: string | null,
): { inserts: TraitHypothesisInsert[]; records: TraitHypothesisRecord[] } {
  const createdAt = new Date().toISOString();

  const records = (Object.entries(traitScores) as [TraitName, number][])
    .map(([traitKey, score]) => {
      const id = randomUUID();
      const hypothesisLabel = scoreLabel(score);
      const hypothesisText = buildHypothesisText(traitKey, score);
      const uncertainty = Math.max(0, Math.min(1, 1 - confidence));
      const record: TraitHypothesisRecord = {
        id,
        userId,
        traitKey,
        hypothesisLabel,
        hypothesisText,
        score,
        confidence,
        uncertainty,
        evidenceIds,
        sourcePatternIds: patternIds,
        modelName,
        modelVersion,
        promptVersion,
        status: 'active',
        supersedesHypothesisId: null,
        supersededByHypothesisId: null,
        analysisJobId: analysisJobId ?? null,
        createdAt,
      };
      return record;
    });

  return {
    records,
    inserts: records.map(({ id, createdAt, ...rest }) => rest),
  };
}

export class InferTraitsUseCase {
  constructor(
    private readonly expRepo: IExperienceRepository,
    private readonly clusterQuery: IClusterQueryRepository,
    private readonly traitHypothesisRepo: ITraitHypothesisRepository,
    private readonly llm: ILLMPort,
    private readonly logger: ILoggerPort,
    private readonly retry: LLMRetryPolicy,
    private readonly validator: LLMResponseValidator,
    private readonly userSettingsRepo: IUserSettingsRepository | null = null,
  ) {}

  async execute(
    userId: string,
    context?: AnalysisContext,
    options?: { strict?: boolean },
  ): Promise<TraitHypothesisResult> {
    const strict = options?.strict ?? false;
    const userSettings = this.userSettingsRepo
      ? await this.userSettingsRepo.ensureDefaultByUser(userId)
      : { analysisEnabled: true } as const;
    if (!userSettings.analysisEnabled) {
      return {
        hypotheses: [],
        summary: {
          generatedCount: 0,
          acceptedCount: 0,
          rejectedCount: 0,
          evidenceCount: 0,
          usedModel: 'analysis_disabled',
          usedPromptVersion: 'v004',
        },
      };
    }
    let clusters: ClusterData[] = [];
    let experiences: ExperienceData[] = [];
    let activeHypotheses: TraitHypothesisRecord[] = [];

    // If context is provided (from AnalysisJobConsumer), use context data
    // Otherwise, use traditional fetching for backward compatibility
    if (context) {
      // Use context data
      if (context.previousPatterns) {
        clusters = context.previousPatterns;
      }
      // Combine recent and unprocessed logs as experiences
      experiences = [
        ...context.recentLogs.map((log) => ({
          id: log.id,
          userId,
          description: log.description,
          stressLevel: log.stressLevel,
          reportDifficulty: 3,
          careful: false,
          actionResult: 'CONFRONTED_SUCCESS' as const,
          visibility: 'analysis_allowed' as const,
          date: log.loggedAt,
          domainKey: String(log.domain),
        })),
        ...context.unprocessedLogs.map((log) => ({
          id: log.id,
          userId,
          description: log.description,
          stressLevel: log.stressLevel,
          reportDifficulty: 3,
          careful: false,
          actionResult: 'CONFRONTED_SUCCESS' as const,
          visibility: 'analysis_allowed' as const,
          date: log.loggedAt,
          domainKey: String(log.domain),
        })),
      ];
      activeHypotheses = context.activeHypotheses ?? [];
    } else {
      // Backward compatibility: fetch clusters and recent experiences
      const [queryClusters, recentExps] = await Promise.all([
        this.clusterQuery.findByUser(userId),
        this.expRepo.findRecent(userId, 20, { visibility: 'analysis_allowed' }),
      ]);
      clusters = queryClusters;
      experiences = recentExps;
      activeHypotheses = await this.traitHypothesisRepo.findActiveByUser(userId);
    }

    if (experiences.length === 0) {
      return {
        hypotheses: [],
        summary: {
          generatedCount: 0,
          acceptedCount: 0,
          rejectedCount: 0,
          evidenceCount: 0,
          usedModel: 'no_analysis_allowed_evidence',
          usedPromptVersion: 'v004',
        },
      };
    }

    const userMessage = buildTraitUserMessage(clusters, experiences, activeHypotheses);

    let traitScores: Record<TraitName, number>;
    let bigFiveResult: BigFiveResponse | null = null;
    let usedModel = 'unknown';
    try {
      const { text, modelName } = await this.retry.execute(() =>
        this.llm.generate(TRAIT_SYSTEM_PROMPT, userMessage, 1024),
      );
      usedModel = modelName;
      bigFiveResult = this.validator.validateBigFiveResponse(text);
      if (bigFiveResult) {
        traitScores = deriveLegacyTraitsFromBigFive(bigFiveResult.bigFive);
      } else {
        traitScores = this.validator.validateTraitResponse(text) ?? buildFallbackTraits(clusters);
      }
    } catch (err) {
      this.logger.warn('infer:llm_failed', { userId, err });
      if (strict) throw err;
      traitScores = buildFallbackTraits(clusters);
    }

    const evidenceIds = [...experiences.map((e) => e.id), ...clusters.map((c) => c.id)];
    const patternIds = clusters.map((c) => c.id);
    const confidence = bigFiveResult?.bigFive.confidence ?? 0.5;
    const promptVersion = 'v004';
    const { inserts, records } = buildHypotheses(
      userId,
      traitScores,
      evidenceIds,
      patternIds,
      usedModel,
      usedModel,
      promptVersion,
      confidence,
    );

    await this.traitHypothesisRepo.appendMany(inserts);

    return {
      hypotheses: records,
      summary: {
        generatedCount: records.length,
        acceptedCount: records.length,
        rejectedCount: 0,
        evidenceCount: evidenceIds.length,
        usedModel,
        usedPromptVersion: promptVersion,
      },
    };
  }
}
