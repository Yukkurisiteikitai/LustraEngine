import type { SupabaseClient } from '@supabase/supabase-js';
import type { IMessageRepository } from '@/core/domains/chat/IMessageRepository';
import type { MessageData } from '@/core/domains/chat/Message';
import { MessageMapper } from '@/application/mappers/MessageMapper';
import { InfrastructureError } from '@/core/errors/InfrastructureError';

export class SupabaseMessageRepository implements IMessageRepository {
  constructor(private supabase: SupabaseClient) {}

  async findByThread(threadId: string): Promise<MessageData[]> {
    const { data, error } = await this.supabase
      .from('messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });

    if (error) throw new InfrastructureError(`メッセージ取得エラー: ${error.message}`);
    return (data ?? []).map((row) => MessageMapper.fromRow(row as Record<string, unknown>));
  }

  async save(input: Omit<MessageData, 'id' | 'createdAt'>): Promise<MessageData> {
    const { data, error } = await this.supabase
      .from('messages')
      .insert({
        thread_id: input.threadId,
        user_id: input.userId,
        role: input.role,
        contexts: input.contexts,
        context_id_set: input.contextIdSet,
        token_count: input.tokenCount ?? null,
        model_id: input.modelId ?? null,
      })
      .select('*')
      .single();

    if (error) throw new InfrastructureError(`メッセージ保存エラー: ${error.message}`);
    return MessageMapper.fromRow(data as Record<string, unknown>);
  }

  async appendContext(messageId: string, newContext: string): Promise<MessageData> {
    // append to array and advance index to the new element
    const { data, error } = await this.supabase.rpc('append_message_context', {
      p_message_id: messageId,
      p_new_context: newContext,
    });

    if (error) throw new InfrastructureError(`コンテキスト追加エラー: ${error.message}`);
    return MessageMapper.fromRow(data as Record<string, unknown>);
  }

  async setContextId(messageId: string, index: number): Promise<void> {
    const { error } = await this.supabase
      .from('messages')
      .update({ context_id_set: index })
      .eq('id', messageId);

    if (error) throw new InfrastructureError(`コンテキストID更新エラー: ${error.message}`);
  }
}
