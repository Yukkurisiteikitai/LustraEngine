BEGIN;

-- ====================================================
-- 1. Add per-message price snapshot column.
--    role determines token type: 'user' = input,
--    'assistant' = output.  token_count already exists.
-- ====================================================
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(18,8);

-- ====================================================
-- 2. Usage index: includes role so the planner can
--    efficiently filter without a partial index
-- ====================================================
CREATE INDEX IF NOT EXISTS idx_messages_usage
  ON messages(user_id, model_id, role, created_at);

-- ====================================================
-- 3. Replace v_user_llm_usage with a corrected view
--    that uses per-row price snapshots for cost and
--    derives input/output split from role.
--
--    Cost is NULL for rows missing price data.
--    WITH (security_invoker = true) ensures the caller's
--    RLS policies on messages are enforced.
-- ====================================================
CREATE OR REPLACE VIEW v_user_llm_usage WITH (security_invoker = true) AS
SELECT
  m.user_id,
  lm.name                                                           AS model_name,
  COUNT(*)::INT                                                     AS total_messages,
  COALESCE(SUM(CASE WHEN m.role = 'user'      THEN m.token_count END), 0)::BIGINT
                                                                    AS total_input_tokens,
  COALESCE(SUM(CASE WHEN m.role = 'assistant' THEN m.token_count END), 0)::BIGINT
                                                                    AS total_output_tokens,
  ROUND(
    SUM(
      CASE
        WHEN m.unit_price  IS NULL
          OR m.token_count IS NULL
        THEN NULL
        ELSE m.token_count * m.unit_price
      END
    ) / 1000000.0,
    6
  )                                                                 AS estimated_cost_usd,
  MIN(m.created_at)                                                 AS first_used_at,
  MAX(m.created_at)                                                 AS last_used_at
FROM messages m
JOIN llm_models lm ON lm.id = m.model_id
WHERE m.model_id IS NOT NULL
GROUP BY m.user_id, lm.id, lm.name;

-- Preserve the same permissions as migration 011
REVOKE SELECT ON v_user_llm_usage FROM anon;
GRANT  SELECT ON v_user_llm_usage TO authenticated;

COMMIT;
