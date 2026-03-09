import type { MessageData } from '@/core/domains/chat/Message';

export class MessageMapper {
  static fromRow(row: Record<string, unknown>): MessageData {
    return {
      id: row.id as string,
      threadId: row.thread_id as string,
      userId: row.user_id as string,
      role: row.role as 'user' | 'assistant',
      contexts: row.contexts as string[],
      contextIdSet: row.context_id_set as number,
      createdAt: row.created_at as string,
    };
  }
}
