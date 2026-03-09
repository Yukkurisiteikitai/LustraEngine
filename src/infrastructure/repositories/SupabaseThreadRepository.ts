import type { SupabaseClient } from '@supabase/supabase-js';
import type { IThreadRepository } from '@/core/domains/chat/IThreadRepository';
import type { ThreadData } from '@/core/domains/chat/Thread';
import { ThreadMapper } from '@/application/mappers/ThreadMapper';
import { InfrastructureError } from '@/core/errors/InfrastructureError';

export class SupabaseThreadRepository implements IThreadRepository {
  constructor(private supabase: SupabaseClient) {}

  async findByUser(userId: string): Promise<ThreadData[]> {
    const { data, error } = await this.supabase
      .from('threads')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new InfrastructureError(`スレッド取得エラー: ${error.message}`);
    return (data ?? []).map((row) => ThreadMapper.fromRow(row as Record<string, unknown>));
  }

  async save(userId: string, title: string): Promise<ThreadData> {
    const { data, error } = await this.supabase
      .from('threads')
      .insert({ user_id: userId, title })
      .select('*')
      .single();

    if (error) throw new InfrastructureError(`スレッド作成エラー: ${error.message}`);
    return ThreadMapper.fromRow(data as Record<string, unknown>);
  }

  async delete(threadId: string): Promise<void> {
    const { error } = await this.supabase
      .from('threads')
      .delete()
      .eq('id', threadId);

    if (error) throw new InfrastructureError(`スレッド削除エラー: ${error.message}`);
  }
}
