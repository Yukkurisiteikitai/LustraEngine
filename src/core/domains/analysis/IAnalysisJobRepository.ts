import type { AnalysisJob, CreateAnalysisJobInput } from './AnalysisJob';

export interface IAnalysisJobRepository {
  /**
   * Create an analysis job if no active job exists for user+mode
   * Returns existing job if one is already pending/running
   */
  createOrGetActive(
    userId: string,
    input: CreateAnalysisJobInput,
    trigger: 'daily' | 'manual',
    idempotencyKey: string,
  ): Promise<AnalysisJob>;

  /**
   * Get job by ID (scoped to user)
   */
  getById(userId: string, jobId: string): Promise<AnalysisJob | null>;

  /**
   * Get latest jobs for user, ordered by creation
   */
  listRecent(userId: string, limit?: number): Promise<AnalysisJob[]>;
}
