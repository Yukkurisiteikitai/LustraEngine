CREATE TABLE IF NOT EXISTS token_usage_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  used_tokens integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_token_usage_windows_user_id ON token_usage_windows(user_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_windows_window_start ON token_usage_windows(window_start);

ALTER TABLE token_usage_windows ENABLE ROW LEVEL SECURITY;

-- Only service_role can access (rate limiter runs server-side with service role key)
CREATE POLICY "service_role_only" ON token_usage_windows
  FOR ALL TO service_role USING (true) WITH CHECK (true);
