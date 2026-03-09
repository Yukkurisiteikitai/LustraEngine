import type { ThreadData } from './Thread';

export interface IThreadRepository {
  findByUser(userId: string): Promise<ThreadData[]>;
  save(userId: string, title: string): Promise<ThreadData>;
  delete(threadId: string): Promise<void>;
}
