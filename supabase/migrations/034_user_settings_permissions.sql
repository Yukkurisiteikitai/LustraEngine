-- User Data Permission Settings
-- Extends the existing user_settings model with permission-oriented defaults,
-- audit logs, and safer evidence metadata.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS allow_snapshot_generation boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_chat_history_save boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_confirmation_before_reanalysis boolean NOT NULL DEFAULT true;

UPDATE user_settings
SET
  allow_snapshot_generation = COALESCE(allow_snapshot_generation, allow_model_snapshot_generation, true),
  allow_chat_history_save = COALESCE(allow_chat_history_save, false),
  require_confirmation_before_reanalysis = COALESCE(require_confirmation_before_reanalysis, true)
WHERE true;

ALTER TABLE user_settings
  ALTER COLUMN default_evidence_visibility SET DEFAULT 'private';

UPDATE user_settings
SET default_evidence_visibility = 'private'
WHERE default_evidence_visibility IS NULL;

ALTER TABLE experiences
  ADD COLUMN IF NOT EXISTS report_difficulty smallint NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS careful boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS soft_deleted_at timestamptz NULL;

ALTER TABLE experiences
  ADD CONSTRAINT experiences_report_difficulty_check
  CHECK (report_difficulty BETWEEN 1 AND 5);

CREATE INDEX IF NOT EXISTS idx_experiences_user_visibility_soft_deleted_logged
  ON experiences(user_id, visibility, soft_deleted_at, logged_at DESC);

CREATE TABLE IF NOT EXISTS user_settings_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  setting_key text NOT NULL DEFAULT 'user_settings',
  old_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  new_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_settings_audit_logs_user_idx
  ON user_settings_audit_logs(user_id, changed_at DESC);

ALTER TABLE user_settings_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_settings_audit_logs_select_own ON user_settings_audit_logs
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY user_settings_audit_logs_insert_own ON user_settings_audit_logs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.user_settings (
    user_id,
    analysis_enabled,
    include_sensitive_evidence,
    default_evidence_visibility,
    allow_chat_fallback_draft,
    allow_snapshot_generation,
    allow_model_snapshot_generation,
    allow_chat_history_save,
    require_confirmation_before_reanalysis,
    data_export_enabled
  )
  VALUES (
    NEW.id,
    true,
    false,
    'private',
    true,
    true,
    true,
    false,
    true,
    true
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

INSERT INTO public.user_settings (
  user_id,
  analysis_enabled,
  include_sensitive_evidence,
  default_evidence_visibility,
  allow_chat_fallback_draft,
  allow_snapshot_generation,
  allow_model_snapshot_generation,
  allow_chat_history_save,
  require_confirmation_before_reanalysis,
  data_export_enabled
)
SELECT
  au.id,
  true,
  false,
  'private',
  true,
  true,
  true,
  false,
  true,
  true
FROM auth.users AS au
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION get_unclassified_experiences(
  p_user_id UUID,
  p_limit   INT DEFAULT 10,
  p_visibility TEXT DEFAULT NULL
)
RETURNS TABLE (
  id                 UUID,
  user_id            UUID,
  logged_at          DATE,
  description        TEXT,
  goal               TEXT,
  action             TEXT,
  emotion            TEXT,
  context            TEXT,
  trigger            TEXT,
  outcome            TEXT,
  emotion_level      SMALLINT,
  stress_level       SMALLINT,
  domain_id          UUID,
  tags               TEXT[],
  action_result      TEXT,
  action_memo        TEXT,
  created_at         TIMESTAMPTZ,
  domain_description TEXT,
  visibility         TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    e.id,
    e.user_id,
    e.logged_at,
    e.description,
    e.goal,
    e.action,
    e.emotion,
    e.context,
    e.trigger,
    e.outcome,
    e.emotion_level,
    e.stress_level,
    e.domain_id,
    e.tags,
    e.action_result,
    e.action_memo,
    e.created_at,
    d.description AS domain_description,
    e.visibility
  FROM public.experiences e
  LEFT JOIN public.domains d ON d.id = e.domain_id
  WHERE e.user_id = p_user_id
    AND e.soft_deleted_at IS NULL
    AND (p_visibility IS NULL OR e.visibility = p_visibility)
    AND NOT EXISTS (
      SELECT 1 FROM public.experience_cluster_map ecm
      WHERE ecm.experience_id = e.id
    )
  ORDER BY e.created_at DESC
  LIMIT p_limit;
$$;
