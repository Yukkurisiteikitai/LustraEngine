import type { SupabaseClient } from '@supabase/supabase-js';
import type { IExperienceRepository, CreateExperienceInput } from '@/core/domains/experience/IExperienceRepository';
import type { ExperienceData } from '@/core/domains/experience/Experience';
import { ExperienceMapper } from '@/application/mappers/ExperienceMapper';
import { InfrastructureError } from '@/core/errors/InfrastructureError';

export class SupabaseExperienceRepository implements IExperienceRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async save(
    userId: string,
    inputs: CreateExperienceInput[],
    date: string,
    domainMap: Map<string, string>,
  ): Promise<ExperienceData[]> {
    const rows = inputs.map((o) => ({
      user_id: userId,
      logged_at: date,
      description: o.description,
      stress_level: o.stressLevel,
      action_result: o.actionResult,
      action_memo: o.actionMemo ?? null,
      goal: o.goal ?? null,
      action: o.action ?? null,
      emotion: o.emotion ?? null,
      context: o.context ?? null,
      domain_id: domainMap.get(o.domain) ?? null,
    }));

    const { data, error } = await this.supabase
      .from('experiences')
      .insert(rows)
      .select('*, domains(description)');

    if (error) throw new InfrastructureError('experience:save failed', error);
    return (data ?? []).map((r) => ExperienceMapper.fromRow(r as Record<string, unknown>));
  }

  async findSince(userId: string, fromDate: string): Promise<ExperienceData[]> {
    const { data, error } = await this.supabase
      .from('experiences')
      .select('*, domains(description)')
      .eq('user_id', userId)
      .gte('logged_at', fromDate)
      .order('logged_at', { ascending: false });

    if (error) throw new InfrastructureError('experience:findSince failed', error);
    return (data ?? []).map((r) => ExperienceMapper.fromRow(r as Record<string, unknown>));
  }

  async findAllDates(userId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('experiences')
      .select('logged_at')
      .eq('user_id', userId)
      .order('logged_at', { ascending: false });

    if (error) throw new InfrastructureError('experience:findAllDates failed', error);
    return (data ?? []).map((d) => d.logged_at as string);
  }

  async findUnclassified(userId: string): Promise<ExperienceData[]> {
    const { data, error } = await this.supabase
      .rpc('get_unclassified_experiences', { p_user_id: userId, p_limit: 10 });

    if (error) throw new InfrastructureError('experience:findUnclassified failed', error);
    return (data ?? []).map((r: Record<string, unknown>) => ExperienceMapper.fromRow(r));
  }

  async findRecent(userId: string, limit: number): Promise<ExperienceData[]> {
    const { data, error } = await this.supabase
      .from('experiences')
      .select('*, domains(description)')
      .eq('user_id', userId)
      .order('logged_at', { ascending: false })
      .limit(limit);

    if (error) throw new InfrastructureError('experience:findRecent failed', error);
    return (data ?? []).map((r) => ExperienceMapper.fromRow(r as Record<string, unknown>));
  }
}
