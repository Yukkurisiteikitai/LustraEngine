import type { SupabaseClient } from '@supabase/supabase-js';
import type { ITraitHypothesisRepository } from '@/core/domains/trait/ITraitHypothesisRepository';
import type {
  TraitHypothesisInsert,
  TraitHypothesisRecord,
} from '@/core/domains/trait/TraitHypothesis';
import { InfrastructureError } from '@/core/errors/InfrastructureError';

const PAGE_SIZE = 1000;

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function fromRow(row: Record<string, unknown>): TraitHypothesisRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    traitKey: row.trait_key as string,
    hypothesisLabel: row.hypothesis_label as string,
    hypothesisText: row.hypothesis_text as string,
    score: typeof row.score === 'number' ? row.score : undefined,
    confidence: row.confidence as number,
    uncertainty: row.uncertainty as number,
    evidenceIds: toStringArray(row.evidence_ids),
    sourcePatternIds: toStringArray(row.source_pattern_ids),
    modelName: row.model_name as string,
    modelVersion: row.model_version as string,
    promptVersion: row.prompt_version as string,
    status: row.status as TraitHypothesisRecord['status'],
    supersedesHypothesisId: (row.supersedes_hypothesis_id as string | null) ?? null,
    supersededByHypothesisId: (row.superseded_by_hypothesis_id as string | null) ?? null,
    analysisJobId: (row.analysis_job_id as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

function toRow(record: TraitHypothesisInsert) {
  return {
    ...(record.id ? { id: record.id } : {}),
    user_id: record.userId,
    trait_key: record.traitKey,
    hypothesis_label: record.hypothesisLabel,
    hypothesis_text: record.hypothesisText,
    score: record.score ?? null,
    confidence: record.confidence,
    uncertainty: record.uncertainty,
    evidence_ids: record.evidenceIds,
    source_pattern_ids: record.sourcePatternIds,
    model_name: record.modelName,
    model_version: record.modelVersion,
    prompt_version: record.promptVersion,
    status: record.status ?? 'active',
    supersedes_hypothesis_id: record.supersedesHypothesisId ?? null,
    superseded_by_hypothesis_id: record.supersededByHypothesisId ?? null,
    analysis_job_id: record.analysisJobId ?? null,
    ...(record.createdAt ? { created_at: record.createdAt } : {}),
  };
}

export class SupabaseTraitHypothesisRepository implements ITraitHypothesisRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  private async fetchAllByUser(
    userId: string,
    status?: TraitHypothesisRecord['status'],
  ): Promise<TraitHypothesisRecord[]> {
    const records: TraitHypothesisRecord[] = [];

    for (let from = 0; ; from += PAGE_SIZE) {
      let query = this.supabase
        .from('trait_hypothesis_history')
        .select('*')
        .eq('user_id', userId);

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw new InfrastructureError('traitHypothesis:fetchAllByUser failed', error);

      const page = data ?? [];
      records.push(...page.map((row) => fromRow(row as Record<string, unknown>)));
      if (page.length < PAGE_SIZE) break;
    }

    return records;
  }

  async append(record: TraitHypothesisInsert): Promise<void> {
    const { error } = await this.supabase
      .from('trait_hypothesis_history')
      .insert(toRow(record));

    if (error) throw new InfrastructureError('traitHypothesis:append failed', error);
  }

  async appendMany(records: TraitHypothesisInsert[]): Promise<void> {
    if (records.length === 0) return;

    const { error } = await this.supabase
      .from('trait_hypothesis_history')
      .insert(records.map(toRow));

    if (error) throw new InfrastructureError('traitHypothesis:appendMany failed', error);
  }

  async findByUser(userId: string, limit = 20): Promise<TraitHypothesisRecord[]> {
    const { data, error } = await this.supabase
      .from('trait_hypothesis_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new InfrastructureError('traitHypothesis:findByUser failed', error);
    return (data ?? []).map((row) => fromRow(row as Record<string, unknown>));
  }

  async findAllByUser(userId: string): Promise<TraitHypothesisRecord[]> {
    return this.fetchAllByUser(userId);
  }

  async findActiveByUser(userId: string): Promise<TraitHypothesisRecord[]> {
    return this.fetchAllByUser(userId, 'active');
  }

  async markRevised(ids: string[], supersededById: string | null = null): Promise<void> {
    if (ids.length === 0) return;

    const { error } = await this.supabase
      .from('trait_hypothesis_history')
      .update({
        status: 'revised',
        superseded_by_hypothesis_id: supersededById,
        updated_at: new Date().toISOString(),
      })
      .in('id', ids);

    if (error) throw new InfrastructureError('traitHypothesis:markRevised failed', error);
  }

  async markStatusByEvidenceIds(
    userId: string,
    evidenceIds: string[],
    status: TraitHypothesisRecord['status'],
  ): Promise<number> {
    if (evidenceIds.length === 0) return 0;

    const evidenceIdSet = new Set(evidenceIds);
    const affectedIds = (await this.findActiveByUser(userId))
      .filter((hypothesis) => hypothesis.evidenceIds.some((id) => evidenceIdSet.has(id)))
      .map((hypothesis) => hypothesis.id);

    if (affectedIds.length === 0) return 0;

    const { data, error } = await this.supabase
      .from('trait_hypothesis_history')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .in('id', affectedIds)
      .eq('user_id', userId)
      .eq('status', 'active')
      .select('id');

    if (error) {
      throw new InfrastructureError('traitHypothesis:markStatusByEvidenceIds failed', error);
    }

    return data?.length ?? affectedIds.length;
  }
}
