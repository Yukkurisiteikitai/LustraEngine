-- Extend get_token_usage_in_window to also return per-request stats
-- needed for predictive rate limiting (block when remainingTokens < avg)
CREATE OR REPLACE FUNCTION get_token_usage_in_window(
  p_user_id uuid,
  p_window_start timestamptz
)
RETURNS TABLE(
  total_used bigint,
  oldest_window_start timestamptz,
  avg_tokens_per_request numeric,
  request_count bigint
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    COALESCE(SUM(used_tokens), 0)  AS total_used,
    MIN(window_start)              AS oldest_window_start,
    COALESCE(AVG(used_tokens), 0)  AS avg_tokens_per_request,
    COUNT(*)                       AS request_count
  FROM token_usage_windows
  WHERE user_id = p_user_id
    AND window_start >= p_window_start;
$$;
