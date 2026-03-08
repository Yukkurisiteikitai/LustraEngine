import type { SupabaseClient } from '@supabase/supabase-js';
import type { IPersonaRepository } from '@/core/domains/persona/IPersonaRepository';
import type { PersonaData, PersonaJson } from '@/core/domains/persona/Persona';
import { PersonaMapper } from '@/application/mappers/PersonaMapper';
import { InfrastructureError } from '@/core/errors/InfrastructureError';

export class SupabasePersonaRepository implements IPersonaRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async saveSnapshot(userId: string, persona: PersonaJson, traitsHash: string): Promise<void> {
    // version は DB側で自動採番 (SERIAL)
    const { error } = await this.supabase.from('persona_snapshots').insert({
      user_id: userId,
      persona_json: persona,
      traits_hash: traitsHash,
    });

    if (error) throw new InfrastructureError('persona:saveSnapshot failed', error);
  }

  async getLatest(userId: string): Promise<PersonaData | null> {
    const { data, error } = await this.supabase
      .from('persona_snapshots')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new InfrastructureError('persona:getLatest failed', error);
    if (!data) return null;

    return PersonaMapper.fromRow(data as Record<string, unknown>);
  }

  async getHistory(userId: string, limit = 10): Promise<PersonaData[]> {
    const { data, error } = await this.supabase
      .from('persona_snapshots')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new InfrastructureError('persona:getHistory failed', error);
    return (data ?? []).map((r) => PersonaMapper.fromRow(r as Record<string, unknown>));
  }
}
