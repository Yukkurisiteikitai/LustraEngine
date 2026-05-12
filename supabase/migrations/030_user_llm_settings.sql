-- Persist user LLM settings server-side with encrypted API keys

CREATE TABLE IF NOT EXISTS user_llm_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  type text NOT NULL,
  model text NOT NULL,
  base_url text NULL,
  encrypted_api_key text NULL,
  has_api_key boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_llm_settings
ADD CONSTRAINT user_llm_settings_provider_check
CHECK (provider IN ('openai', 'anthropic', 'gemini', 'deepseek', 'custom_openai_compatible'));

ALTER TABLE user_llm_settings
ADD CONSTRAINT user_llm_settings_type_check
CHECK (type IN ('gpt', 'claude', 'gemini'));

CREATE UNIQUE INDEX IF NOT EXISTS user_llm_settings_active_unique
ON user_llm_settings (user_id)
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS user_llm_settings_user_active_idx
ON user_llm_settings (user_id, is_active, updated_at DESC);

ALTER TABLE user_llm_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_llm_settings_select_own ON user_llm_settings
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY user_llm_settings_insert_own ON user_llm_settings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_llm_settings_update_own ON user_llm_settings
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
