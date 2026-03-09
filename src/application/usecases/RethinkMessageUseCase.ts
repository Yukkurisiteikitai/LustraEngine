import type { IMessageRepository } from '@/core/domains/chat/IMessageRepository';
import type { MessageData } from '@/core/domains/chat/Message';

export class RethinkMessageUseCase {
  constructor(private messageRepo: IMessageRepository) {}

  async execute(messageId: string, newContext: string): Promise<MessageData> {
    return this.messageRepo.appendContext(messageId, newContext);
  }

  async selectContext(messageId: string, index: number): Promise<void> {
    return this.messageRepo.setContextId(messageId, index);
  }
}
