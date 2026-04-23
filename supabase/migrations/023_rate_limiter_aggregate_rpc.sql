CREATE OR REPLACE FUNCTION get_token_usage_in_window(
  p_user_id uuid,
  p_window_start timestamptz
)
RETURNS TABLE(total_used bigint, oldest_window_start timestamptz)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    COALESCE(SUM(used_tokens), 0) AS total_used,
    MIN(window_start) AS oldest_window_start
  FROM token_usage_windows
  WHERE user_id = p_user_id
    AND window_start >= p_window_start;
$$;
