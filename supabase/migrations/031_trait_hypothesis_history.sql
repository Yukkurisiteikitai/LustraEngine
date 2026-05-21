-- Append-only history for evidence-based trait hypotheses.
-- This migration adds new storage without altering or dropping existing tables.

CREATE TABLE IF NOT EXISTS trait_hypothesis_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  trait_key TEXT NOT NULL,
  hypothesis_label TEXT NOT NULL,
  hypothesis_text TEXT NOT NULL,

  -- Optional numeric signal for ranking; not a definitive personality value.
  score REAL NULL CHECK (score IS NULL OR score BETWEEN 0 AND 1),
  confidence REAL NOT NULL DEFAULT 0.1 CHECK (confidence BETWEEN 0 AND 1),
  uncertainty REAL NOT NULL DEFAULT 0.5 CHECK (uncertainty BETWEEN 0 AND 1),

  -- Evidence references are stored as JSON arrays of IDs to keep the schema flexible.
  evidence_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_pattern_ids JSONB NOT NULL DEFAULT '[]'::jsonb,

  model_name TEXT NOT NULL,
  model_version TEXT NOT NULL,
  prompt_version TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'active',
  supersedes_hypothesis_id UUID NULL,
  superseded_by_hypothesis_id UUID NULL,
  analysis_job_id UUID NULL REFERENCES analysis_jobs(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT trait_hypothesis_history_status_check
    CHECK (status IN ('active', 'revised', 'rejected', 'archived'))
);

ALTER TABLE trait_hypothesis_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_trait_hypothesis_history"
  ON trait_hypothesis_history
  FOR ALL
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_trait_hypothesis_history_user_created
  ON trait_hypothesis_history (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trait_hypothesis_history_user_trait_status
  ON trait_hypothesis_history (user_id, trait_key, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trait_hypothesis_history_analysis_job
  ON trait_hypothesis_history (analysis_job_id);
