import type { IPairNodeRepository } from '@/core/domains/chat/IPairNodeRepository';
import type { IMessageRepository } from '@/core/domains/chat/IMessageRepository';
import type { ILlmModelRepository } from '@/core/domains/llm/ILlmModelRepository';
import type { TokenUsage } from '@/application/ports/ILLMPort';

export class SaveChatMessageUseCase {
  constructor(
    private readonly pairNodeRepo: IPairNodeRepository,
    private readonly messageRepo: IMessageRepository,
    private readonly llmModelRepo: ILlmModelRepository,
  ) {}

  async execute(
    threadId: string,
    userId: string,
    userContent: string,
    assistantContent: string,
    opts?: { tokenUsage?: TokenUsage; modelName?: string },
  ): Promise<{ pairNodeId: string }> {
    let modelId: string | undefined;
    let unitPrice: number | undefined;
    if (opts?.modelName) {
      modelId = await this.llmModelRepo.upsertByName(opts.modelName);
      const pricing = await this.llmModelRepo.getPricing(modelId);
      unitPrice = pricing.outputPrice ?? undefined;
    }

    const pairNode = await this.pairNodeRepo.save(userId, threadId);

    const [, assistantMessage] = await Promise.all([
      this.messageRepo.save({
        pairNodeId: pairNode.id,
        userId,
        role: 'user',
        content: userContent,
      }),
      this.messageRepo.save({
        pairNodeId: pairNode.id,
        userId,
        role: 'assistant',
        content: assistantContent,
        tokenCount: opts?.tokenUsage?.output,
        modelId,
        unitPrice,
      }),
    ]);

    await this.pairNodeRepo.updateSelectMessage(pairNode.id, assistantMessage.id, pairNode.version);

    return { pairNodeId: pairNode.id };
  }
}
