import type { SupabaseClient } from '@supabase/supabase-js';
import type { IUserRepository } from '@/core/domains/user/IUserRepository';
import { InfrastructureError } from '@/core/errors/InfrastructureError';

type Domain = 'WORK' | 'RELATIONSHIP' | 'HEALTH' | 'MONEY' | 'SELF';

const DEFAULT_DOMAIN_NAMES: Record<Domain, string> = {
  WORK: '仕事',
  RELATIONSHIP: '人間関係',
  HEALTH: '健康',
  MONEY: 'お金',
  SELF: '自分',
};

const DOMAIN_KEYS = Object.keys(DEFAULT_DOMAIN_NAMES) as Domain[];

export class SupabaseUserRepository implements IUserRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async ensureProfile(userId: string, displayName: string | null): Promise<void> {
    const { error } = await this.supabase
      .from('users')
      .upsert({ id: userId, display_name: displayName }, { onConflict: 'id' });

    if (error) throw new InfrastructureError('user:ensureProfile failed', error);
  }

  async ensureDefaultDomains(userId: string): Promise<Map<string, string>> {
    const rows = DOMAIN_KEYS.map((key) => ({
      user_id: userId,
      name: DEFAULT_DOMAIN_NAMES[key],
      description: key,
    }));

    await this.supabase
      .from('domains')
      .upsert(rows, { onConflict: 'user_id,name', ignoreDuplicates: true });

    const { data, error } = await this.supabase
      .from('domains')
      .select('id, description')
      .eq('user_id', userId);

    if (error) throw new InfrastructureError('user:ensureDefaultDomains failed', error);

    const map = new Map<string, string>();
    for (const row of data ?? []) {
      if (row.description && DOMAIN_KEYS.includes(row.description as Domain)) {
        map.set(row.description as string, row.id as string);
      }
    }
    return map;
  }
}
