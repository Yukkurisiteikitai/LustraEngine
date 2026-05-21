-- User-managed settings and evidence visibility

CREATE TABLE IF NOT EXISTS user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  analysis_enabled boolean NOT NULL DEFAULT true,
  include_sensitive_evidence boolean NOT NULL DEFAULT false,
  default_evidence_visibility text NOT NULL DEFAULT 'analysis_allowed',
  allow_chat_fallback_draft boolean NOT NULL DEFAULT true,
  allow_model_snapshot_generation boolean NOT NULL DEFAULT true,
  data_export_enabled boolean NOT NULL DEFAULT true,
  data_deletion_requested_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_settings_user_unique UNIQUE (user_id),
  CONSTRAINT user_settings_default_visibility_check CHECK (
    default_evidence_visibility IN ('private', 'analysis_allowed', 'excluded')
  )
);

CREATE INDEX IF NOT EXISTS user_settings_user_idx
  ON user_settings (user_id, updated_at DESC);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_settings_select_own ON user_settings
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY user_settings_insert_own ON user_settings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_settings_update_own ON user_settings
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE experiences
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'analysis_allowed';

ALTER TABLE experiences
  ADD CONSTRAINT experiences_visibility_check
  CHECK (visibility IN ('private', 'analysis_allowed', 'excluded'));

CREATE INDEX IF NOT EXISTS idx_experiences_user_visibility_logged
  ON experiences(user_id, visibility, logged_at DESC);

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
    allow_model_snapshot_generation,
    data_export_enabled
  )
  VALUES (
    NEW.id,
    true,
    false,
    'analysis_allowed',
    true,
    true,
    true
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_settings_created ON auth.users;

CREATE TRIGGER on_auth_user_settings_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_settings();

INSERT INTO public.user_settings (
  user_id,
  analysis_enabled,
  include_sensitive_evidence,
  default_evidence_visibility,
  allow_chat_fallback_draft,
  allow_model_snapshot_generation,
  data_export_enabled
)
SELECT
  au.id,
  true,
  false,
  'analysis_allowed',
  true,
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
    AND (p_visibility IS NULL OR e.visibility = p_visibility)
    AND NOT EXISTS (
      SELECT 1 FROM public.experience_cluster_map ecm
      WHERE ecm.experience_id = e.id
    )
  ORDER BY e.created_at DESC
  LIMIT p_limit;
$$;
