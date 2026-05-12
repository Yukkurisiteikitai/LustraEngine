-- Create analysis_jobs table for persistent job state tracking
-- This table tracks all analysis jobs (daily batch and manual analysis)
-- Status flows: pending -> running -> completed/failed

CREATE TABLE IF NOT EXISTS analysis_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_type text NOT NULL DEFAULT 'analysis',
  trigger text NOT NULL,
  mode text NOT NULL,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'pending',
  idempotency_key text NOT NULL,
  target_from timestamptz NULL,
  target_to timestamptz NULL,
  result jsonb NULL,
  error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  scheduled_at timestamptz NULL,
  started_at timestamptz NULL,
  completed_at timestamptz NULL
);

-- Constraints for field validation
ALTER TABLE analysis_jobs
ADD CONSTRAINT analysis_jobs_trigger_check
CHECK (trigger IN ('daily', 'manual'));

ALTER TABLE analysis_jobs
ADD CONSTRAINT analysis_jobs_mode_check
CHECK (mode IN ('quick', 'full_3months', 'daily'));

ALTER TABLE analysis_jobs
ADD CONSTRAINT analysis_jobs_priority_check
CHECK (priority IN ('normal', 'high'));

ALTER TABLE analysis_jobs
ADD CONSTRAINT analysis_jobs_status_check
CHECK (status IN ('pending', 'running', 'completed', 'failed'));

-- Uniqueness constraints for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS analysis_jobs_idempotency_key_unique
ON analysis_jobs (idempotency_key);

-- Prevent duplicate active jobs (only one pending/running per user+job_type+mode)
CREATE UNIQUE INDEX IF NOT EXISTS analysis_jobs_active_unique
ON analysis_jobs (user_id, job_type, mode)
WHERE status IN ('pending', 'running');

-- Performance indexes
CREATE INDEX IF NOT EXISTS analysis_jobs_user_status_idx
ON analysis_jobs (user_id, status);

CREATE INDEX IF NOT EXISTS analysis_jobs_status_priority_created_idx
ON analysis_jobs (status, priority, created_at);

CREATE INDEX IF NOT EXISTS analysis_jobs_user_trigger_created_idx
ON analysis_jobs (user_id, trigger, created_at DESC);

-- Enable RLS
ALTER TABLE analysis_jobs ENABLE ROW LEVEL SECURITY;

-- Users can read their own jobs
CREATE POLICY analysis_jobs_select_own ON analysis_jobs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users cannot directly insert (jobs created via API/worker only)
-- Workers and batch operations use service role (bypass RLS)
