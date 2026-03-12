-- llm_models
CREATE TABLE llm_models (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        UNIQUE NOT NULL,
  deprecated_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE llm_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated select" ON llm_models FOR SELECT TO authenticated USING (true);

-- llm_model_pricing
CREATE TABLE llm_model_pricing (
  id           UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id     UUID           NOT NULL REFERENCES llm_models(id) ON DELETE CASCADE,
  input_price  NUMERIC(18,8)  NOT NULL,
  output_price NUMERIC(18,8)  NOT NULL,
  created_at   TIMESTAMPTZ    NOT NULL DEFAULT now(),
  UNIQUE (model_id)
);
ALTER TABLE llm_model_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated select" ON llm_model_pricing FOR SELECT TO authenticated USING (true);

-- messages ALTER
ALTER TABLE messages
  ADD COLUMN token_count INT,
  ADD COLUMN model_id    UUID REFERENCES llm_models(id);
