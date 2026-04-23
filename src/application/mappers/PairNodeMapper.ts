import type { PairNodeData } from '@/core/domains/chat/PairNode';

export class PairNodeMapper {
  static fromRow(row: Record<string, unknown>): PairNodeData {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      threadId: row.thread_id as string,
      selectMessageId: row.select_message_id != null ? (row.select_message_id as string) : null,
      createdAt: row.created_at as string,
      version: typeof row.version === 'number' ? row.version : 0,
    };
  }
}
