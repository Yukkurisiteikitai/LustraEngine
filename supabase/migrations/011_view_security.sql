-- security_invoker=true にすることで、ビューを呼び出したユーザーの権限で実行される。
-- これにより messages テーブルの RLS ポリシー (user_id = auth.uid()) が継承される。
CREATE OR REPLACE VIEW v_user_llm_usage WITH (security_invoker = true) AS
SELECT
  m.user_id,
  lm.name                                            AS model_name,
  COUNT(*)::INT                                      AS total_messages,
  COALESCE(SUM(m.token_count), 0)::BIGINT            AS total_tokens,
  CASE WHEN p.output_price IS NOT NULL
    THEN ROUND((COALESCE(SUM(m.token_count), 0) * p.output_price / 1000000.0)::NUMERIC, 6)
    ELSE NULL
  END                                                AS estimated_cost_usd,
  MIN(m.created_at)                                  AS first_used_at,
  MAX(m.created_at)                                  AS last_used_at
FROM messages m
JOIN llm_models lm ON lm.id = m.model_id
LEFT JOIN llm_model_pricing p ON p.model_id = lm.id
WHERE m.role = 'assistant'
  AND m.token_count IS NOT NULL
  AND m.model_id IS NOT NULL
GROUP BY m.user_id, lm.id, lm.name, p.output_price;

-- anon ロールからアクセスを禁止し、ログイン済みユーザーのみ許可
REVOKE SELECT ON v_user_llm_usage FROM anon;
GRANT  SELECT ON v_user_llm_usage TO authenticated;