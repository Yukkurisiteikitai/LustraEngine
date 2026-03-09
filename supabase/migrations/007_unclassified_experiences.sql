-- RPC: get_unclassified_experiences
-- Returns experiences that have no entry in experience_cluster_map (unclassified)

CREATE OR REPLACE FUNCTION get_unclassified_experiences(
  p_user_id UUID,
  p_limit   INT DEFAULT 10
)
RETURNS TABLE (
  id           UUID,
  user_id      UUID,
  logged_at    DATE,
  description  TEXT,
  goal         TEXT,
  action       TEXT,
  emotion      TEXT,
  context      TEXT,
  trigger      TEXT,
  outcome      TEXT,
  emotion_level     SMALLINT,
  stress_level      SMALLINT,
  domain_id         UUID,
  tags              TEXT[],
  action_result     TEXT,
  action_memo       TEXT,
  created_at        TIMESTAMPTZ,
  domain_description TEXT
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
    d.description AS domain_description
  FROM public.experiences e
  LEFT JOIN public.domains d ON d.id = e.domain_id
  WHERE e.user_id = p_user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.experience_cluster_map ecm
      WHERE ecm.experience_id = e.id
    )
  ORDER BY e.created_at DESC
  LIMIT p_limit;
$$;
