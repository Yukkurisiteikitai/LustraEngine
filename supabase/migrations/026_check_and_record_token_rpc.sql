CREATE OR REPLACE FUNCTION check_and_record_tokens(
  p_user_id uuid,
  p_tokens integer,
  p_max_tokens integer,
  p_window_ms bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_window_start timestamptz := now() - (p_window_ms || ' milliseconds')::interval;
  v_used bigint;
  v_oldest timestamptz;
BEGIN
  -- Lock the user's rows to prevent concurrent over-spend
  SELECT COALESCE(SUM(used_tokens), 0), MIN(window_start)
  INTO v_used, v_oldest
  FROM token_usage_windows
  WHERE user_id = p_user_id
    AND window_start >= v_window_start
  FOR UPDATE;

  IF v_used >= p_max_tokens THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'usedTokens', v_used,
      'oldestWindowStart', v_oldest
    );
  END IF;

  -- Under budget: record usage atomically
  INSERT INTO token_usage_windows(user_id, window_start, used_tokens)
  VALUES (p_user_id, now(), p_tokens);

  RETURN jsonb_build_object(
    'allowed', true,
    'usedTokens', v_used + p_tokens,
    'oldestWindowStart', v_oldest
  );
END;
$$;
