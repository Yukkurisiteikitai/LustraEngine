import type { IMessageRepository } from '@/core/domains/chat/IMessageRepository';
import type { ILlmModelRepository } from '@/core/domains/llm/ILlmModelRepository';
import type { MessageData } from '@/core/domains/chat/Message';

export class SaveChatMessageUseCase {
  constructor(
    private readonly messageRepo: IMessageRepository,
    private readonly llmModelRepo: ILlmModelRepository,
  ) {}

  async execute(
    threadId: string,
    userId: string,
    role: 'user' | 'assistant',
    content: string,
    opts?: { tokenCount?: number; modelName?: string },
  ): Promise<MessageData> {
    let modelId: string | undefined;
    if (role === 'assistant' && opts?.modelName) {
      modelId = await this.llmModelRepo.upsertByName(opts.modelName);
    }
    return this.messageRepo.save({
      threadId,
      userId,
      role,
      contexts: [content],
      contextIdSet: 0,
      tokenCount: role === 'assistant' ? opts?.tokenCount : undefined,
      modelId,
    });
  }
}
