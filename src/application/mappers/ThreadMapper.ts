import type { ThreadData } from '@/core/domains/chat/Thread';

export class ThreadMapper {
  static fromRow(row: Record<string, unknown>): ThreadData {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      title: row.title as string,
      createdAt: row.created_at as string,
    };
  }
}
