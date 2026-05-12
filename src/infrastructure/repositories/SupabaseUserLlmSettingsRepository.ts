import type { SupabaseClient } from '@supabase/supabase-js';
import type { IUserLlmSettingsRepository } from '@/core/domains/llm/IUserLlmSettingsRepository';
import type { UserLlmSettings, UserLlmSettingsInput } from '@/core/domains/llm/LlmSettings';

function mapRow(row: Record<string, unknown>): UserLlmSettings {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    provider: row.provider as UserLlmSettings['provider'],
    type: row.type as UserLlmSettings['type'],
    model: row.model as string,
    baseUrl: (row.base_url as string | null) ?? null,
    encryptedApiKey: (row.encrypted_api_key as string | null) ?? null,
    hasApiKey: Boolean(row.has_api_key),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export class SupabaseUserLlmSettingsRepository implements IUserLlmSettingsRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getActiveByUser(userId: string): Promise<UserLlmSettings | null> {
    const { data, error } = await this.supabase
      .from('user_llm_settings')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load LLM settings: ${error.message}`);
    }

    return data ? mapRow(data as Record<string, unknown>) : null;
  }

  async upsertActive(
    userId: string,
    input: UserLlmSettingsInput,
    encryptedApiKey: string | null,
  ): Promise<UserLlmSettings> {
    const existing = await this.getActiveByUser(userId);
    const now = new Date().toISOString();

    if (existing) {
      const { data, error } = await this.supabase
        .from('user_llm_settings')
        .update({
          provider: input.provider,
          type: input.type,
          model: input.model,
          base_url: input.baseUrl ?? null,
          encrypted_api_key: encryptedApiKey ?? existing.encryptedApiKey,
          has_api_key: encryptedApiKey ? true : existing.hasApiKey,
          updated_at: now,
        })
        .eq('id', existing.id)
        .eq('user_id', userId)
        .select('*')
        .single();

      if (error) {
        throw new Error(`Failed to update LLM settings: ${error.message}`);
      }

      return mapRow(data as Record<string, unknown>);
    }

    const { data, error } = await this.supabase
      .from('user_llm_settings')
      .insert({
        user_id: userId,
        provider: input.provider,
        type: input.type,
        model: input.model,
        base_url: input.baseUrl ?? null,
        encrypted_api_key: encryptedApiKey,
        has_api_key: Boolean(encryptedApiKey),
        is_active: true,
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to create LLM settings: ${error.message}`);
    }

    return mapRow(data as Record<string, unknown>);
  }
}
