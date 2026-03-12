import type { PairNodeData } from './PairNode';

export interface IPairNodeRepository {
  findByThread(threadId: string): Promise<PairNodeData[]>;
  save(userId: string, threadId: string): Promise<PairNodeData>;
  updateSelectMessage(pairNodeId: string, messageId: string): Promise<void>;
}
