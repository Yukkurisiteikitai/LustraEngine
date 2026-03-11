import type { IPairNodeRepository } from '@/core/domains/chat/IPairNodeRepository';
import type { IMessageRepository } from '@/core/domains/chat/IMessageRepository';
import type { MessageData } from '@/core/domains/chat/Message';

export class RethinkMessageUseCase {
  constructor(
    private readonly pairNodeRepo: IPairNodeRepository,
    private readonly messageRepo: IMessageRepository,
  ) {}

  async execute(pairNodeId: string, userId: string, newContent: string): Promise<MessageData> {
    const newMessage = await this.messageRepo.save({
      pairNodeId,
      userId,
      role: 'assistant',
      content: newContent,
    });
    await this.pairNodeRepo.updateSelectMessage(pairNodeId, newMessage.id);
    return newMessage;
  }
}
