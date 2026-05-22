-- Replace the search RPC with field-specific predicates so the matching GIN
-- index can be used directly by Postgres.

CREATE OR REPLACE FUNCTION public.search_experiences(
  p_user_id uuid,
  p_field text,
  p_query text,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  logged_at date,
  description text,
  goal text,
  action text,
  emotion text,
  context text,
  trigger text,
  outcome text,
  emotion_level smallint,
  stress_level smallint,
  domain_id uuid,
  tags text[],
  action_result text,
  action_memo text,
  source text,
  visibility text,
  report_difficulty smallint,
  careful boolean,
  processed_at timestamptz,
  soft_deleted_at timestamptz,
  created_at timestamptz,
  domain_description text,
  matched_field text,
  search_rank real
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  tsq tsquery;
BEGIN
  IF p_query IS NULL OR btrim(p_query) = '' THEN
    RETURN;
  END IF;

  IF p_field NOT IN ('description', 'context', 'action', 'emotion', 'goal', 'action_memo') THEN
    RAISE EXCEPTION 'Unsupported search field: %', p_field;
  END IF;

  tsq := websearch_to_tsquery('simple', p_query);

  IF p_field = 'description' THEN
    RETURN QUERY
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
        e.source,
        e.visibility,
        e.report_difficulty,
        e.careful,
        e.processed_at,
        e.soft_deleted_at,
        e.created_at,
        d.description AS domain_description,
        p_field AS matched_field,
        ts_rank(e.description_search, tsq) AS search_rank
      FROM experiences e
      LEFT JOIN domains d ON d.id = e.domain_id
      WHERE e.user_id = p_user_id
        AND e.soft_deleted_at IS NULL
        AND e.description_search @@ tsq
      ORDER BY search_rank DESC, e.logged_at DESC, e.created_at DESC
      LIMIT LEAST(GREATEST(p_limit, 1), 100);
  ELSIF p_field = 'context' THEN
    RETURN QUERY
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
        e.source,
        e.visibility,
        e.report_difficulty,
        e.careful,
        e.processed_at,
        e.soft_deleted_at,
        e.created_at,
        d.description AS domain_description,
        p_field AS matched_field,
        ts_rank(e.context_search, tsq) AS search_rank
      FROM experiences e
      LEFT JOIN domains d ON d.id = e.domain_id
      WHERE e.user_id = p_user_id
        AND e.soft_deleted_at IS NULL
        AND e.context_search @@ tsq
      ORDER BY search_rank DESC, e.logged_at DESC, e.created_at DESC
      LIMIT LEAST(GREATEST(p_limit, 1), 100);
  ELSIF p_field = 'action' THEN
    RETURN QUERY
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
        e.source,
        e.visibility,
        e.report_difficulty,
        e.careful,
        e.processed_at,
        e.soft_deleted_at,
        e.created_at,
        d.description AS domain_description,
        p_field AS matched_field,
        ts_rank(e.action_search, tsq) AS search_rank
      FROM experiences e
      LEFT JOIN domains d ON d.id = e.domain_id
      WHERE e.user_id = p_user_id
        AND e.soft_deleted_at IS NULL
        AND e.action_search @@ tsq
      ORDER BY search_rank DESC, e.logged_at DESC, e.created_at DESC
      LIMIT LEAST(GREATEST(p_limit, 1), 100);
  ELSIF p_field = 'emotion' THEN
    RETURN QUERY
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
        e.source,
        e.visibility,
        e.report_difficulty,
        e.careful,
        e.processed_at,
        e.soft_deleted_at,
        e.created_at,
        d.description AS domain_description,
        p_field AS matched_field,
        ts_rank(e.emotion_search, tsq) AS search_rank
      FROM experiences e
      LEFT JOIN domains d ON d.id = e.domain_id
      WHERE e.user_id = p_user_id
        AND e.soft_deleted_at IS NULL
        AND e.emotion_search @@ tsq
      ORDER BY search_rank DESC, e.logged_at DESC, e.created_at DESC
      LIMIT LEAST(GREATEST(p_limit, 1), 100);
  ELSIF p_field = 'goal' THEN
    RETURN QUERY
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
        e.source,
        e.visibility,
        e.report_difficulty,
        e.careful,
        e.processed_at,
        e.soft_deleted_at,
        e.created_at,
        d.description AS domain_description,
        p_field AS matched_field,
        ts_rank(e.goal_search, tsq) AS search_rank
      FROM experiences e
      LEFT JOIN domains d ON d.id = e.domain_id
      WHERE e.user_id = p_user_id
        AND e.soft_deleted_at IS NULL
        AND e.goal_search @@ tsq
      ORDER BY search_rank DESC, e.logged_at DESC, e.created_at DESC
      LIMIT LEAST(GREATEST(p_limit, 1), 100);
  ELSE
    RETURN QUERY
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
        e.source,
        e.visibility,
        e.report_difficulty,
        e.careful,
        e.processed_at,
        e.soft_deleted_at,
        e.created_at,
        d.description AS domain_description,
        p_field AS matched_field,
        ts_rank(e.action_memo_search, tsq) AS search_rank
      FROM experiences e
      LEFT JOIN domains d ON d.id = e.domain_id
      WHERE e.user_id = p_user_id
        AND e.soft_deleted_at IS NULL
        AND e.action_memo_search @@ tsq
      ORDER BY search_rank DESC, e.logged_at DESC, e.created_at DESC
      LIMIT LEAST(GREATEST(p_limit, 1), 100);
  END IF;
END;
$$;
