import type { SupabaseClient } from '@supabase/supabase-js';
import type { IAnalysisJobRepository } from '@/core/domains/analysis/IAnalysisJobRepository';
import type { AnalysisJob, CreateAnalysisJobInput } from '@/core/domains/analysis/AnalysisJob';

export class SupabaseAnalysisJobRepository implements IAnalysisJobRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  private mapFromDb(row: Record<string, unknown>): AnalysisJob {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      jobType: row.job_type as string,
      trigger: row.trigger as AnalysisJob['trigger'],
      mode: row.mode as AnalysisJob['mode'],
      priority: row.priority as AnalysisJob['priority'],
      status: row.status as AnalysisJob['status'],
      idempotencyKey: row.idempotency_key as string,
      targetFrom: (row.target_from as string) || null,
      targetTo: (row.target_to as string) || null,
      result: (row.result as Record<string, unknown>) || null,
      error: (row.error as string) || null,
      createdAt: row.created_at as string,
      scheduledAt: (row.scheduled_at as string) || null,
      startedAt: (row.started_at as string) || null,
      completedAt: (row.completed_at as string) || null,
    };
  }

  async createOrGetActive(
    userId: string,
    input: CreateAnalysisJobInput,
    trigger: 'daily' | 'manual',
    idempotencyKey: string,
  ): Promise<AnalysisJob> {
    const priority = trigger === 'manual' ? 'high' : 'normal';
    const mode = input.mode === 'quick' ? 'quick' : 'full_3months';

    // First try to get an active job
    const { data: activeJobs, error: selectError } = await this.supabase
      .from('analysis_jobs')
      .select('*')
      .eq('user_id', userId)
      .eq('job_type', 'analysis')
      .eq('mode', mode)
      .in('status', ['pending', 'running'])
      .limit(1);

    if (selectError) {
      throw new Error(`Failed to check active jobs: ${selectError.message}`);
    }

    if (activeJobs && activeJobs.length > 0) {
      return this.mapFromDb(activeJobs[0] as Record<string, unknown>);
    }

    // No active job, create a new one
    const { data: newJob, error: insertError } = await this.supabase
      .from('analysis_jobs')
      .insert([
        {
          user_id: userId,
          job_type: 'analysis',
          trigger,
          mode,
          priority,
          status: 'pending',
          idempotency_key: idempotencyKey,
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (insertError) {
      // If idempotency key conflict, return the existing job
      if (insertError.code === '23505') {
        const { data: existingJob, error: retryError } = await this.supabase
          .from('analysis_jobs')
          .select('*')
          .eq('idempotency_key', idempotencyKey)
          .single();

        if (retryError) {
          throw new Error(`Failed to retrieve existing job: ${retryError.message}`);
        }

        return this.mapFromDb(existingJob as Record<string, unknown>);
      }

      throw new Error(`Failed to create analysis job: ${insertError.message}`);
    }

    return this.mapFromDb(newJob as Record<string, unknown>);
  }

  async getById(userId: string, jobId: string): Promise<AnalysisJob | null> {
    const { data, error } = await this.supabase
      .from('analysis_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Not found
        return null;
      }
      throw new Error(`Failed to get analysis job: ${error.message}`);
    }

    return this.mapFromDb(data as Record<string, unknown>);
  }

  async listRecent(userId: string, limit: number = 10): Promise<AnalysisJob[]> {
    const { data, error } = await this.supabase
      .from('analysis_jobs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to list analysis jobs: ${error.message}`);
    }

    return (data || []).map((row) => this.mapFromDb(row as Record<string, unknown>));
  }
}
