import type { SupabaseClient } from '@supabase/supabase-js';
import type { IUserRepository } from '@/core/domains/user/IUserRepository';
import { InfrastructureError } from '@/core/errors/InfrastructureError';
import { VALID_DOMAINS, type Domain } from '@/core/domains/domain/Domain';

const DEFAULT_DOMAIN_NAMES: Record<Domain, string> = {
  WORK: '仕事',
  RELATIONSHIP: '人間関係',
  HEALTH: '健康',
  MONEY: 'お金',
  SELF: '自分',
};

export class SupabaseUserRepository implements IUserRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async ensureProfile(userId: string, displayName: string | null): Promise<void> {
    const { error } = await this.supabase
      .from('users')
      .upsert({ id: userId, display_name: displayName }, { onConflict: 'id' });

    if (error) throw new InfrastructureError('user:ensureProfile failed', error);
  }

  async ensureDefaultDomains(userId: string): Promise<Map<string, string>> {
    const rows = VALID_DOMAINS.map((key) => ({
      user_id: userId,
      name: DEFAULT_DOMAIN_NAMES[key],
      description: key,
    }));

    const { error: upsertError } = await this.supabase
      .from('domains')
      .upsert(rows, { onConflict: 'user_id,name', ignoreDuplicates: true });

    if (upsertError) {
      throw new InfrastructureError('domains:upsert failed', upsertError);
    }

    const { data, error } = await this.supabase
      .from('domains')
      .select('id, description')
      .eq('user_id', userId);

    if (error) throw new InfrastructureError('user:ensureDefaultDomains failed', error);

    const map = new Map<string, string>();
    for (const row of data ?? []) {
      const desc = row.description;
      if (typeof desc === 'string' && (VALID_DOMAINS as readonly string[]).includes(desc)) {
        map.set(desc, row.id as string);
      }
    }
    return map;
  }
}
