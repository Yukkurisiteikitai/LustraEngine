import type { AnalysisQueueMessage } from '@/cloudflare-env';
import type { IAnalysisQueuePort } from '@/application/ports/IAnalysisQueuePort';

/**
 * Cloudflare Queues producer
 * Sends analysis job messages to the analysis-jobs queue
 */
export class CloudflareAnalysisQueueProducer implements IAnalysisQueuePort {
  constructor(private readonly queue: Queue<AnalysisQueueMessage>) {}

  async enqueue(message: AnalysisQueueMessage): Promise<void> {
    await this.queue.send(message);
  }
}
