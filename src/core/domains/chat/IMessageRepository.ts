import type { MessageData } from './Message';

export interface IMessageRepository {
  findByThread(threadId: string): Promise<MessageData[]>;
  save(data: Omit<MessageData, 'id' | 'createdAt'>): Promise<MessageData>;
  appendContext(messageId: string, newContext: string): Promise<MessageData>;
  setContextId(messageId: string, index: number): Promise<void>;
}
