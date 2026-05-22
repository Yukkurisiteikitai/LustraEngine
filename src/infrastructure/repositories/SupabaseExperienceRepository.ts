import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  IExperienceRepository,
  CreateExperienceInput,
  ExperienceQueryOptions,
} from '@/core/domains/experience/IExperienceRepository';
import type { ExperienceData } from '@/core/domains/experience/Experience';
import { ExperienceMapper } from '@/application/mappers/ExperienceMapper';
import { InfrastructureError } from '@/core/errors/InfrastructureError';

function normalizeVisibility(
  visibility?: ExperienceQueryOptions['visibility'],
): string[] | null {
  if (!visibility) return null;
  return Array.isArray(visibility) ? visibility : [visibility];
}

export class SupabaseExperienceRepository implements IExperienceRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findAllByUser(userId: string): Promise<ExperienceData[]> {
    const { data, error } = await this.supabase
      .from('experiences')
      .select('*, domains(description)')
      .eq('user_id', userId)
      .order('logged_at', { ascending: false });

    if (error) throw new InfrastructureError('experience:findAllByUser failed', error);
    return (data ?? []).map((r) => ExperienceMapper.fromRow(r as Record<string, unknown>));
  }

  async findById(userId: string, experienceId: string): Promise<ExperienceData | null> {
    const { data, error } = await this.supabase
      .from('experiences')
      .select('*, domains(description)')
      .eq('user_id', userId)
      .eq('id', experienceId)
      .is('soft_deleted_at', null)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new InfrastructureError('experience:findById failed', error);
    }

    return data ? ExperienceMapper.fromRow(data as Record<string, unknown>) : null;
  }

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
      source: o.source ?? null,
      visibility: o.visibility ?? 'private',
      report_difficulty: o.reportDifficulty ?? 3,
      careful: o.careful ?? (o.reportDifficulty ?? 3) >= 4,
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

  async findSince(
    userId: string,
    fromDate: string,
    options?: ExperienceQueryOptions,
  ): Promise<ExperienceData[]> {
    let query = this.supabase
      .from('experiences')
      .select('*, domains(description)')
      .eq('user_id', userId)
      .is('soft_deleted_at', null)
      .gte('logged_at', fromDate)
      .order('logged_at', { ascending: false });

    const visibility = normalizeVisibility(options?.visibility);
    if (visibility) {
      query = query.in('visibility', visibility);
    }

    const { data, error } = await query;

    if (error) throw new InfrastructureError('experience:findSince failed', error);
    return (data ?? []).map((r) => ExperienceMapper.fromRow(r as Record<string, unknown>));
  }

  async findAllDates(
    userId: string,
    options?: ExperienceQueryOptions,
  ): Promise<string[]> {
    let query = this.supabase
      .from('experiences')
      .select('logged_at')
      .eq('user_id', userId)
      .is('soft_deleted_at', null)
      .order('logged_at', { ascending: false });

    const visibility = normalizeVisibility(options?.visibility);
    if (visibility) {
      query = query.in('visibility', visibility);
    }

    const { data, error } = await query;

    if (error) throw new InfrastructureError('experience:findAllDates failed', error);
    return (data ?? []).map((d) => d.logged_at as string);
  }

  async findUnclassified(
    userId: string,
    options?: ExperienceQueryOptions,
  ): Promise<ExperienceData[]> {
    const { data, error } = await this.supabase.rpc('get_unclassified_experiences', {
      p_user_id: userId,
      p_limit: 10,
      p_visibility: normalizeVisibility(options?.visibility)?.[0] ?? null,
    });

    if (error) throw new InfrastructureError('experience:findUnclassified failed', error);
    return (data ?? []).map((r: Record<string, unknown>) => ExperienceMapper.fromRow(r));
  }

  async findRecent(
    userId: string,
    limit: number,
    options?: ExperienceQueryOptions,
  ): Promise<ExperienceData[]> {
    let query = this.supabase
      .from('experiences')
      .select('*, domains(description)')
      .eq('user_id', userId)
      .is('soft_deleted_at', null)
      .order('logged_at', { ascending: false })
      .limit(limit);

    const visibility = normalizeVisibility(options?.visibility);
    if (visibility) {
      query = query.in('visibility', visibility);
    }

    const { data, error } = await query;

    if (error) throw new InfrastructureError('experience:findRecent failed', error);
    return (data ?? []).map((r) => ExperienceMapper.fromRow(r as Record<string, unknown>));
  }

  async softDelete(userId: string, experienceIds: string[]): Promise<ExperienceData[]> {
    if (experienceIds.length === 0) return [];

    const now = new Date().toISOString();
    const { data, error } = await this.supabase
      .from('experiences')
      .update({
        soft_deleted_at: now,
        updated_at: now,
      })
      .eq('user_id', userId)
      .in('id', experienceIds)
      .select('*, domains(description)');

    if (error) throw new InfrastructureError('experience:softDelete failed', error);
    return (data ?? []).map((r) => ExperienceMapper.fromRow(r as Record<string, unknown>));
  }

  async exclude(userId: string, experienceIds: string[]): Promise<ExperienceData[]> {
    if (experienceIds.length === 0) return [];

    const now = new Date().toISOString();
    const { data, error } = await this.supabase
      .from('experiences')
      .update({
        visibility: 'excluded',
        updated_at: now,
      })
      .eq('user_id', userId)
      .in('id', experienceIds)
      .select('*, domains(description)');

    if (error) throw new InfrastructureError('experience:exclude failed', error);
    return (data ?? []).map((r) => ExperienceMapper.fromRow(r as Record<string, unknown>));
  }
}
