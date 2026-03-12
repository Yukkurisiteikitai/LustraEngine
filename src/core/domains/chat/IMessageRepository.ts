import type { MessageData } from './Message';

export interface IMessageRepository {
  findByPairNodes(pairNodeIds: string[]): Promise<MessageData[]>;
  save(data: Omit<MessageData, 'id' | 'createdAt'>): Promise<MessageData>;
}
