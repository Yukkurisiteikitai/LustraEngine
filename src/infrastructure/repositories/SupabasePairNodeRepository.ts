import type { SupabaseClient } from '@supabase/supabase-js';
import type { IPairNodeRepository } from '@/core/domains/chat/IPairNodeRepository';
import type { PairNodeData } from '@/core/domains/chat/PairNode';
import { PairNodeMapper } from '@/application/mappers/PairNodeMapper';
import { InfrastructureError } from '@/core/errors/InfrastructureError';

export class SupabasePairNodeRepository implements IPairNodeRepository {
  constructor(private supabase: SupabaseClient) {}

  async findByThread(threadId: string): Promise<PairNodeData[]> {
    const { data, error } = await this.supabase
      .from('pair_nodes')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });

    if (error) throw new InfrastructureError(`ペアノード取得エラー: ${error.message}`);
    return (data ?? []).map((row) => PairNodeMapper.fromRow(row as Record<string, unknown>));
  }

  async save(userId: string, threadId: string): Promise<PairNodeData> {
    const { data, error } = await this.supabase
      .from('pair_nodes')
      .insert({ user_id: userId, thread_id: threadId })
      .select('*')
      .single();

    if (error) throw new InfrastructureError(`ペアノード保存エラー: ${error.message}`);
    return PairNodeMapper.fromRow(data as Record<string, unknown>);
  }

  async updateSelectMessage(pairNodeId: string, messageId: string): Promise<void> {
    const { error } = await this.supabase
      .from('pair_nodes')
      .update({ select_message_id: messageId })
      .eq('id', pairNodeId);

    if (error) throw new InfrastructureError(`ペアノード更新エラー: ${error.message}`);
  }
}
