import type { SupabaseClient } from '@supabase/supabase-js';
import type { ILlmModelRepository } from '@/core/domains/llm/ILlmModelRepository';
import { InfrastructureError } from '@/core/errors/InfrastructureError';

export class SupabaseLlmModelRepository implements ILlmModelRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async upsertByName(name: string): Promise<string> {
    const { data, error } = await this.supabase
      .from('llm_models')
      .upsert({ name }, { onConflict: 'name' })
      .select('id')
      .single();

    if (error) throw new InfrastructureError(`LLMモデル登録エラー: ${error.message}`);
    return data.id as string;
  }
}
