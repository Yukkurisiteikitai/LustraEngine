import type { IMessageRepository } from '@/core/domains/chat/IMessageRepository';
import type { MessageData } from '@/core/domains/chat/Message';

export class SaveChatMessageUseCase {
  constructor(private messageRepo: IMessageRepository) {}

  async execute(
    threadId: string,
    userId: string,
    role: 'user' | 'assistant',
    content: string,
  ): Promise<MessageData> {
    return this.messageRepo.save({
      threadId,
      userId,
      role,
      contexts: [content],
      contextIdSet: 0,
    });
  }
}
