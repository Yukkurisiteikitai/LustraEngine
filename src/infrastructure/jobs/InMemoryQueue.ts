import type { IJobQueue, JobMap } from '@/application/jobs/IJobQueue';
import { logger } from '@/infrastructure/observability/logger';

type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

// MVP: fire-and-forget (Next.js 環境で動く最小実装)
// 本番: RedisQueue / BullMQ に差し替え可能
export class InMemoryQueue implements IJobQueue {
  private handlers = new Map<string, JobHandler>();

  register(jobName: string, handler: JobHandler) {
    this.handlers.set(jobName, handler);
  }

  async enqueue<K extends keyof JobMap>(job: K, payload: JobMap[K]): Promise<void> {
    const handler = this.handlers.get(job);
    if (!handler) {
      logger.warn('job:no-handler', { jobName: job });
      return;
    }
    // fire-and-forget (非同期実行、HTTP response をブロックしない)
    void handler(payload as unknown as Record<string, unknown>).catch((err: unknown) =>
      logger.error('job:failed', { jobName: job, err: String(err) }),
    );
  }
}
