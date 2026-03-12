import type { IThreadRepository } from '@/core/domains/chat/IThreadRepository';
import type { IPairNodeRepository } from '@/core/domains/chat/IPairNodeRepository';
import type { IMessageRepository } from '@/core/domains/chat/IMessageRepository';
import type { ThreadData } from '@/core/domains/chat/Thread';
import type { MessageData } from '@/core/domains/chat/Message';

export class GetThreadHistoryUseCase {
  constructor(
    private readonly threadRepo: IThreadRepository,
    private readonly pairNodeRepo: IPairNodeRepository,
    private readonly messageRepo: IMessageRepository,
  ) {}

  async getThreads(userId: string): Promise<ThreadData[]> {
    return this.threadRepo.findByUser(userId);
  }

  async getMessages(threadId: string): Promise<MessageData[]> {
    const pairNodes = await this.pairNodeRepo.findByThread(threadId);
    if (pairNodes.length === 0) return [];

    const pairNodeIds = pairNodes.map((pn) => pn.id);
    const allMessages = await this.messageRepo.findByPairNodes(pairNodeIds);

    const result: MessageData[] = [];
    for (const pn of pairNodes) {
      const userMsg = allMessages.find((m) => m.pairNodeId === pn.id && m.role === 'user');
      const assistantMsg = pn.selectMessageId
        ? allMessages.find((m) => m.id === pn.selectMessageId)
        : undefined;

      if (userMsg) result.push(userMsg);
      if (assistantMsg) result.push(assistantMsg);
    }

    return result;
  }
}
