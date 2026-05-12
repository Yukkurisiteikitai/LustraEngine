export type AnalysisJobTrigger = 'daily' | 'manual';
export type AnalysisJobMode = 'quick' | 'full_3months' | 'daily';
export type AnalysisJobPriority = 'normal' | 'high';
export type AnalysisJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface AnalysisJob {
  id: string;
  userId: string;
  jobType: string;
  trigger: AnalysisJobTrigger;
  mode: AnalysisJobMode;
  priority: AnalysisJobPriority;
  status: AnalysisJobStatus;
  idempotencyKey: string;
  targetFrom: string | null;
  targetTo: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface CreateAnalysisJobInput {
  mode: AnalysisJobMode;
}
