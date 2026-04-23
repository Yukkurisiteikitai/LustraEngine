import type { SupabaseClient } from '@supabase/supabase-js';
import type { IPairNodeRepository } from '@/core/domains/chat/IPairNodeRepository';
import { ValidationError } from '@/core/errors/ValidationError';
import { ConcurrencyError } from '@/core/errors/ConcurrencyError';
import { InfrastructureError } from '@/core/errors/InfrastructureError';

export class RethinkMessageUseCase {
  constructor(
    private readonly pairNodeRepo: IPairNodeRepository,
    private readonly supabase: SupabaseClient,
  ) {}

  async execute(pairNodeId: string, userId: string, newContent: string): Promise<void> {
    const pairNode = await this.pairNodeRepo.findById(pairNodeId);
    if (!pairNode) throw new ValidationError('指定したペアノードが見つかりません');

    const { error } = await this.supabase.rpc('rethink_pair_node', {
      p_pair_node_id: pairNodeId,
      p_user_id: userId,
      p_content: newContent,
      p_current_version: pairNode.version,
    });

    if (error) {
      if (error.message.includes('concurrency_conflict')) throw new ConcurrencyError();
      throw new InfrastructureError(`rethink_pair_node RPC エラー: ${error.message}`);
    }
  }
}
