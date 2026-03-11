import type { SupabaseClient } from '@supabase/supabase-js';
import type { IMessageRepository } from '@/core/domains/chat/IMessageRepository';
import type { MessageData } from '@/core/domains/chat/Message';
import { MessageMapper } from '@/application/mappers/MessageMapper';
import { InfrastructureError } from '@/core/errors/InfrastructureError';

export class SupabaseMessageRepository implements IMessageRepository {
  constructor(private supabase: SupabaseClient) {}

  async findByPairNodes(pairNodeIds: string[]): Promise<MessageData[]> {
    const { data, error } = await this.supabase
      .from('messages')
      .select('*')
      .in('pair_node_id', pairNodeIds)
      .order('created_at', { ascending: true });

    if (error) throw new InfrastructureError(`メッセージ取得エラー: ${error.message}`);
    return (data ?? []).map((row) => MessageMapper.fromRow(row as Record<string, unknown>));
  }

  async save(input: Omit<MessageData, 'id' | 'createdAt'>): Promise<MessageData> {
    const { data, error } = await this.supabase
      .from('messages')
      .insert({
        pair_node_id: input.pairNodeId,
        user_id: input.userId,
        role: input.role,
        content: input.content,
        token_count: input.tokenCount ?? null,
        model_id: input.modelId ?? null,
        unit_price: input.unitPrice ?? null,
      })
      .select('*')
      .single();

    if (error) throw new InfrastructureError(`メッセージ保存エラー: ${error.message}`);
    return MessageMapper.fromRow(data as Record<string, unknown>);
  }
}
