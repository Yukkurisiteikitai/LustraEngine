-- Add full-text search support for archive lookup
-- Each searchable column gets its own generated tsvector + GIN index so
-- field-specific search can stay fast while still using websearch syntax.

ALTER TABLE experiences
  ADD COLUMN IF NOT EXISTS description_search tsvector
    GENERATED ALWAYS AS (to_tsvector('simple', COALESCE(description, ''))) STORED,
  ADD COLUMN IF NOT EXISTS context_search tsvector
    GENERATED ALWAYS AS (to_tsvector('simple', COALESCE(context, ''))) STORED,
  ADD COLUMN IF NOT EXISTS action_search tsvector
    GENERATED ALWAYS AS (to_tsvector('simple', COALESCE(action, ''))) STORED,
  ADD COLUMN IF NOT EXISTS emotion_search tsvector
    GENERATED ALWAYS AS (to_tsvector('simple', COALESCE(emotion, ''))) STORED,
  ADD COLUMN IF NOT EXISTS goal_search tsvector
    GENERATED ALWAYS AS (to_tsvector('simple', COALESCE(goal, ''))) STORED,
  ADD COLUMN IF NOT EXISTS action_memo_search tsvector
    GENERATED ALWAYS AS (to_tsvector('simple', COALESCE(action_memo, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_experiences_description_search
  ON experiences USING GIN (description_search);

CREATE INDEX IF NOT EXISTS idx_experiences_context_search
  ON experiences USING GIN (context_search);

CREATE INDEX IF NOT EXISTS idx_experiences_action_search
  ON experiences USING GIN (action_search);

CREATE INDEX IF NOT EXISTS idx_experiences_emotion_search
  ON experiences USING GIN (emotion_search);

CREATE INDEX IF NOT EXISTS idx_experiences_goal_search
  ON experiences USING GIN (goal_search);

CREATE INDEX IF NOT EXISTS idx_experiences_action_memo_search
  ON experiences USING GIN (action_memo_search);

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

  RETURN QUERY
    WITH candidate AS (
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
        CASE p_field
          WHEN 'description' THEN e.description_search
          WHEN 'context' THEN e.context_search
          WHEN 'action' THEN e.action_search
          WHEN 'emotion' THEN e.emotion_search
          WHEN 'goal' THEN e.goal_search
          WHEN 'action_memo' THEN e.action_memo_search
        END AS search_vector
      FROM experiences e
      LEFT JOIN domains d ON d.id = e.domain_id
      WHERE e.user_id = p_user_id
        AND e.soft_deleted_at IS NULL
    )
    SELECT
      c.id,
      c.user_id,
      c.logged_at,
      c.description,
      c.goal,
      c.action,
      c.emotion,
      c.context,
      c.trigger,
      c.outcome,
      c.emotion_level,
      c.stress_level,
      c.domain_id,
      c.tags,
      c.action_result,
      c.action_memo,
      c.source,
      c.visibility,
      c.report_difficulty,
      c.careful,
      c.processed_at,
      c.soft_deleted_at,
      c.created_at,
      c.domain_description,
      p_field AS matched_field,
      ts_rank(c.search_vector, tsq) AS search_rank
    FROM candidate c
    WHERE c.search_vector @@ tsq
    ORDER BY search_rank DESC, c.logged_at DESC, c.created_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 100);
END;
$$;
