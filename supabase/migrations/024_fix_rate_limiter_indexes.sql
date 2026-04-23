DROP INDEX IF EXISTS idx_token_usage_windows_user_id;
DROP INDEX IF EXISTS idx_token_usage_windows_window_start;

CREATE INDEX IF NOT EXISTS idx_token_usage_windows_user_window
  ON token_usage_windows(user_id, window_start);
