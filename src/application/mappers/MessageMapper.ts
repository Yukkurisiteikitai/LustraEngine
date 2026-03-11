import type { MessageData } from '@/core/domains/chat/Message';

export class MessageMapper {
  static fromRow(row: Record<string, unknown>): MessageData {
    return {
      id: row.id as string,
      pairNodeId: row.pair_node_id as string,
      userId: row.user_id as string,
      role: row.role as 'user' | 'assistant',
      content: row.content as string,
      createdAt: row.created_at as string,
      tokenCount: row.token_count != null ? (row.token_count as number) : undefined,
      modelId: row.model_id != null ? (row.model_id as string) : undefined,
      unitPrice: row.unit_price != null ? (row.unit_price as number) : undefined,
    };
  }
}
