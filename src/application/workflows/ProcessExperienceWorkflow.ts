import type { DetectPatternsUseCase } from '@/application/usecases/DetectPatternsUseCase';
import type { InferTraitsUseCase } from '@/application/usecases/InferTraitsUseCase';
import type { IJobQueue } from '@/application/jobs/IJobQueue';
import type { DetectPatternsJobPayload } from '@/application/jobs/DetectPatternsJob';
import type { InferTraitsJobPayload } from '@/application/jobs/InferTraitsJob';
import { logger } from '@/infrastructure/observability/logger';

type DetectFactory = (payload: DetectPatternsJobPayload) => DetectPatternsUseCase;
type InferFactory = (payload: InferTraitsJobPayload) => InferTraitsUseCase;

// Workflow = orchestration のみ。factory / new は持たない
export class ProcessExperienceWorkflow {
  constructor(
    private readonly detectFactory: DetectFactory,
    private readonly inferFactory: InferFactory,
    private readonly queue: IJobQueue,
  ) {}

  // detect job runner から呼ばれる
  async runDetect(payload: DetectPatternsJobPayload): Promise<void> {
    const { classified } = await this.detectFactory(payload).execute(payload.userId);
    logger.info('workflow:detect_complete', { userId: payload.userId, classified });
    // detect 完了後に infer を enqueue
    await this.queue.enqueue('inferTraits', payload);
  }

  // infer job runner から呼ばれる
  async runInfer(payload: InferTraitsJobPayload): Promise<void> {
    await this.inferFactory(payload).execute(payload.userId);
    logger.info('workflow:infer_complete', { userId: payload.userId });
  }
}
