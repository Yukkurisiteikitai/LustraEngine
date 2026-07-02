import type { ITraitHypothesisRepository } from '@/core/domains/trait/ITraitHypothesisRepository';
import type { TraitHypothesisRecord } from '@/core/domains/trait/TraitHypothesis';
import type { ILLMPort } from '@/application/ports/ILLMPort';
import type { ILoggerPort } from '@/application/ports/ILoggerPort';
import type { LLMRetryPolicy } from '@/application/llm/policies/LLMRetryPolicy';
import type { LLMResponseValidator } from '@/application/llm/policies/LLMResponseValidator';
import { STRUCTURAL_MIRROR_SYSTEM_PROMPT, buildReviseUserMessage } from '@/application/llm/structuralMirrorPrompt';
import { ValidationError } from '@/core/errors/ValidationError';
import { LLMExtractionFailedError } from '@/core/errors/LLMExtractionFailedError';

export class VerifyTraitHypothesisUseCase {
  constructor(
    private readonly traitHypothesisRepo: ITraitHypothesisRepository,
    private readonly llm: ILLMPort | null,
    private readonly logger: ILoggerPort,
    private readonly retry: LLMRetryPolicy,
    private readonly validator: LLMResponseValidator,
  ) {}

  async confirm(userId: string, hypothesisId: string): Promise<TraitHypothesisRecord> {
    return this.traitHypothesisRepo.confirm(hypothesisId, userId);
  }

  async hold(userId: string, hypothesisId: string): Promise<TraitHypothesisRecord> {
    return this.traitHypothesisRepo.hold(hypothesisId, userId);
  }

  async revise(
    userId: string,
    hypothesisId: string,
    correctionText: string,
  ): Promise<TraitHypothesisRecord> {
    if (!this.llm) {
      throw new ValidationError('reviseアクションにはLLMが必要です');
    }
    const llm = this.llm;

    const liveHypotheses = await this.traitHypothesisRepo.findLiveByUser(userId);
    const target = liveHypotheses.find((h) => h.id === hypothesisId);
    if (!target) {
      throw new ValidationError('指定された仮説が見つかりません。既に改訂済みか、存在しない可能性があります。');
    }

    const userMessage = buildReviseUserMessage(target, liveHypotheses, correctionText);

    let validated: ReturnType<LLMResponseValidator['validateRevisionResponse']> = null;
    let resultModelName = 'unknown';

    for (let attempt = 0; attempt < 2; attempt++) {
      const { text, modelName } = await this.retry.execute(() =>
        llm.generate(STRUCTURAL_MIRROR_SYSTEM_PROMPT, userMessage, 512),
      );
      resultModelName = modelName;
      validated = this.validator.validateRevisionResponse(text);
      if (validated) break;
      this.logger.warn('verify:revision_response_invalid', { userId, hypothesisId, attempt });
    }

    if (!validated) {
      throw new LLMExtractionFailedError(
        'LLMが有効な仮説テキストを生成できませんでした。もう一度試してください。',
      );
    }

    return this.traitHypothesisRepo.reviseAtomic(hypothesisId, userId, {
      userId,
      traitKey: target.traitKey,
      hypothesisLabel: validated.hypothesisLabel,
      hypothesisText: validated.hypothesisText,
      score: target.score,
      confidence: validated.confidence,
      uncertainty: validated.uncertainty,
      evidenceIds: target.evidenceIds,
      sourcePatternIds: target.sourcePatternIds,
      modelName: resultModelName,
      modelVersion: 'mirror_v001',
      promptVersion: 'mirror_v001',
      status: 'active',
      source: 'user_revision',
      revisedFromId: hypothesisId,
      userCorrection: correctionText,
      supersedesHypothesisId: hypothesisId,
      analysisJobId: target.analysisJobId ?? null,
    });
  }
}
