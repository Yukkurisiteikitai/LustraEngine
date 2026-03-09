import type { IThreadRepository } from '@/core/domains/chat/IThreadRepository';
import type { IMessageRepository } from '@/core/domains/chat/IMessageRepository';
import type { ThreadData } from '@/core/domains/chat/Thread';
import type { MessageData } from '@/core/domains/chat/Message';

export class GetThreadHistoryUseCase {
  constructor(
    private threadRepo: IThreadRepository,
    private messageRepo: IMessageRepository,
  ) {}

  async getThreads(userId: string): Promise<ThreadData[]> {
    return this.threadRepo.findByUser(userId);
  }

  async getMessages(threadId: string): Promise<MessageData[]> {
    return this.messageRepo.findByThread(threadId);
  }
}
