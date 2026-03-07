import type { SupabaseClient } from '@supabase/supabase-js';
import type { ITraitRepository } from '@/core/domains/trait/ITraitRepository';
import type { TraitData, TraitName } from '@/core/domains/trait/Trait';
import { InfrastructureError } from '@/core/errors/InfrastructureError';

export class SupabaseTraitRepository implements ITraitRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findByUser(userId: string): Promise<TraitData[]> {
    const { data, error } = await this.supabase
      .from('traits')
      .select('*')
      .eq('user_id', userId)
      .order('name');

    if (error) throw new InfrastructureError('trait:findByUser failed', error);

    return (data ?? []).map((t) => ({
      id: t.id as string,
      userId: t.user_id as string,
      name: t.name as TraitName,
      score: t.score as number,
      updatedAt: t.updated_at as string,
    }));
  }

  async save(userId: string, traits: Record<TraitName, number>): Promise<void> {
    const rows = (Object.entries(traits) as [TraitName, number][]).map(([name, score]) => ({
      user_id: userId,
      name,
      score,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await this.supabase
      .from('traits')
      .upsert(rows, { onConflict: 'user_id,name' });

    if (error) throw new InfrastructureError('trait:save failed', error);
  }
}
