import type { AnalysisQueueMessage } from '@/cloudflare-env';

export interface IAnalysisQueuePort {
  enqueue(message: AnalysisQueueMessage): Promise<void>;
}
