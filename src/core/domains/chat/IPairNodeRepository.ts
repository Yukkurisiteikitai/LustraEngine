import type { PairNodeData } from './PairNode';

export interface IPairNodeRepository {
  findByThread(threadId: string): Promise<PairNodeData[]>;
  findById(pairNodeId: string): Promise<PairNodeData | null>;
  save(userId: string, threadId: string): Promise<PairNodeData>;
  updateSelectMessage(pairNodeId: string, messageId: string, currentVersion: number): Promise<void>;
}
