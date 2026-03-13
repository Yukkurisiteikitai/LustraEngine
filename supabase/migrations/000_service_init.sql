-- ============================================================
-- 000_service_init.sql
-- Single-shot idempotent schema for a fresh Supabase instance.
-- Consolidates migrations 001–013 into final state only.
-- Run this instead of the incremental migrations on a new DB.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. users (Supabase Auth integration)
-- ============================================================
CREATE TABLE users (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own" ON users
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_insert_own" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- 2. domains
-- ============================================================
CREATE TABLE domains (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  description TEXT,
  color       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

ALTER TABLE domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "domains_select_own" ON domains
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "domains_insert_own" ON domains
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "domains_update_own" ON domains
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "domains_delete_own" ON domains
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_domains_user ON domains(user_id);

-- ============================================================
-- 3. experiences
-- ============================================================
CREATE TABLE experiences (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  logged_at    DATE        NOT NULL DEFAULT CURRENT_DATE,
  description  TEXT        NOT NULL,
  goal         TEXT,
  action       TEXT,
  emotion      TEXT,
  context      TEXT,
  trigger      TEXT,
  outcome      TEXT,
  emotion_level  SMALLINT  CHECK (emotion_level BETWEEN 1 AND 5),
  stress_level   SMALLINT  NOT NULL CHECK (stress_level BETWEEN 1 AND 5),
  domain_id    UUID        REFERENCES domains(id) ON DELETE SET NULL,
  tags         TEXT[]      NOT NULL DEFAULT '{}',
  action_result TEXT       NOT NULL CHECK (action_result IN ('AVOIDED', 'CONFRONTED')),
  action_memo  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE experiences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "experiences_select_own" ON experiences
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "experiences_insert_own" ON experiences
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "experiences_update_own" ON experiences
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "experiences_delete_own" ON experiences
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_experiences_user_logged ON experiences(user_id, logged_at DESC);

-- ============================================================
-- 4. episode_clusters
-- ============================================================
CREATE TABLE episode_clusters (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cluster_type     TEXT        NOT NULL CHECK (cluster_type IN (
    'procrastination', 'social_avoidance', 'authority_anxiety', 'perfectionism'
  )),
  label            TEXT        NOT NULL,
  description      TEXT,
  strength         SMALLINT    DEFAULT 1 CHECK (strength BETWEEN 1 AND 10),
  detected_count   INT         DEFAULT 0,
  last_detected_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, cluster_type)
);

ALTER TABLE episode_clusters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own clusters"
  ON episode_clusters FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own clusters"
  ON episode_clusters FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own clusters"
  ON episode_clusters FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete own clusters"
  ON episode_clusters FOR DELETE USING (user_id = auth.uid());

-- ============================================================
-- 5. experience_cluster_map
-- ============================================================
CREATE TABLE experience_cluster_map (
  id            UUID   PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id UUID   NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  cluster_id    UUID   NOT NULL REFERENCES episode_clusters(id) ON DELETE CASCADE,
  confidence    REAL   CHECK (confidence BETWEEN 0 AND 1),
  reasoning     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(experience_id, cluster_id)
);

ALTER TABLE experience_cluster_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own experience cluster maps"
  ON experience_cluster_map FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM experiences e
    WHERE e.id = experience_cluster_map.experience_id AND e.user_id = auth.uid()
  ));
CREATE POLICY "Users can insert own experience cluster maps"
  ON experience_cluster_map FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM experiences e
    WHERE e.id = experience_cluster_map.experience_id AND e.user_id = auth.uid()
  ));
CREATE POLICY "Users can delete own experience cluster maps"
  ON experience_cluster_map FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM experiences e
    WHERE e.id = experience_cluster_map.experience_id AND e.user_id = auth.uid()
  ));

-- ============================================================
-- 6. cluster_edges
-- ============================================================
CREATE TABLE cluster_edges (
  id                UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_cluster_id UUID  NOT NULL REFERENCES episode_clusters(id) ON DELETE CASCADE,
  target_cluster_id UUID  NOT NULL REFERENCES episode_clusters(id) ON DELETE CASCADE,
  edge_type         TEXT  NOT NULL DEFAULT 'leads_to'
    CHECK (edge_type IN ('leads_to', 'triggers', 'reinforces')),
  weight            REAL  DEFAULT 1.0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, source_cluster_id, target_cluster_id)
);

ALTER TABLE cluster_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cluster edges"
  ON cluster_edges FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own cluster edges"
  ON cluster_edges FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own cluster edges"
  ON cluster_edges FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete own cluster edges"
  ON cluster_edges FOR DELETE USING (user_id = auth.uid());

-- ============================================================
-- 7. traits
-- ============================================================
CREATE TABLE traits (
  id         UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT  NOT NULL CHECK (name IN (
    'introversion', 'discipline', 'curiosity', 'risk_tolerance', 'self_criticism', 'social_anxiety'
  )),
  score      REAL  NOT NULL CHECK (score >= 0 AND score <= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

ALTER TABLE traits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_traits" ON traits FOR ALL USING (user_id = auth.uid());

-- ============================================================
-- 8. persona_snapshots (includes traits_hash + version from 005)
-- ============================================================
CREATE TABLE persona_snapshots (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  persona_json JSONB   NOT NULL,
  traits_hash  TEXT,
  version      SERIAL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE persona_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_snapshots" ON persona_snapshots FOR ALL USING (user_id = auth.uid());

CREATE INDEX idx_persona_snapshots_user_created ON persona_snapshots(user_id, created_at DESC);

-- ============================================================
-- 9. llm_models + llm_model_pricing
-- ============================================================
CREATE TABLE llm_models (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        UNIQUE NOT NULL,
  deprecated_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE llm_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated select" ON llm_models FOR SELECT TO authenticated USING (true);

CREATE TABLE llm_model_pricing (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id     UUID          NOT NULL REFERENCES llm_models(id) ON DELETE CASCADE,
  input_price  NUMERIC(18,8) NOT NULL,
  output_price NUMERIC(18,8) NOT NULL,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (model_id)
);

ALTER TABLE llm_model_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated select" ON llm_model_pricing FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 10. threads
-- ============================================================
CREATE TABLE threads (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT        NOT NULL DEFAULT '新しいチャット',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_threads" ON threads FOR ALL USING (user_id = auth.uid());

CREATE INDEX threads_user_created ON threads(user_id, created_at DESC);

-- ============================================================
-- 11. pair_nodes (select_message_id FK added after messages in step 13)
-- ============================================================
CREATE TABLE pair_nodes (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id         UUID        NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  select_message_id UUID,       -- FK to messages(id) added below after messages table
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pair_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_pair_nodes" ON pair_nodes FOR ALL USING (user_id = auth.uid());

CREATE INDEX pair_nodes_thread_created ON pair_nodes(thread_id, created_at ASC);

-- ============================================================
-- 12. messages (final schema — no thread_id, contexts, context_id_set)
-- ============================================================
CREATE TABLE messages (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT          NOT NULL CHECK (role IN ('user', 'assistant')),
  pair_node_id UUID          NOT NULL REFERENCES pair_nodes(id) ON DELETE CASCADE,
  content      TEXT          NOT NULL,
  token_count  INT,
  model_id     UUID          REFERENCES llm_models(id),
  unit_price   NUMERIC(18,8),
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_messages" ON messages FOR ALL USING (user_id = auth.uid());

CREATE INDEX messages_pair_node  ON messages(pair_node_id, created_at ASC);
CREATE INDEX idx_messages_usage  ON messages(user_id, model_id, role, created_at);

-- ============================================================
-- 13. Deferred FK: pair_nodes.select_message_id → messages.id
-- ============================================================
ALTER TABLE pair_nodes
  ADD CONSTRAINT pair_nodes_select_fkey
  FOREIGN KEY (select_message_id) REFERENCES messages(id) ON DELETE SET NULL;

-- ============================================================
-- 14. Functions
-- ============================================================

-- handle_new_user: auto-create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'display_name');
  RETURN NEW;
END;
$$;

-- increment_cluster_count: atomic counter for cluster detection
CREATE OR REPLACE FUNCTION increment_cluster_count(p_cluster_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  UPDATE public.episode_clusters
  SET detected_count = detected_count + 1, updated_at = now()
  WHERE id = p_cluster_id AND user_id = auth.uid();
END;
$$;

-- classify_experience_atomic: 2-arg secure version (006)
CREATE OR REPLACE FUNCTION classify_experience_atomic(
  p_experience_id UUID,
  p_assignments   JSONB
) RETURNS VOID AS $$
DECLARE
  assignment   JSONB;
  cluster_id   UUID;
  newly_mapped UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF jsonb_typeof(p_assignments) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_assignments must be a JSON array';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.experiences
    WHERE id = p_experience_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'experience not found or access denied';
  END IF;

  FOR assignment IN SELECT * FROM jsonb_array_elements(p_assignments) LOOP
    IF assignment->>'clusterType' IS NULL OR assignment->>'clusterType' = '' THEN
      RAISE EXCEPTION 'clusterType is required';
    END IF;

    INSERT INTO public.episode_clusters (user_id, cluster_type, label, description, last_detected_at)
    VALUES (
      auth.uid(),
      assignment->>'clusterType',
      assignment->>'label',
      assignment->>'description',
      NOW()
    )
    ON CONFLICT (user_id, cluster_type)
    DO UPDATE SET label = EXCLUDED.label, last_detected_at = NOW()
    RETURNING id INTO cluster_id;

    INSERT INTO public.experience_cluster_map (experience_id, cluster_id, confidence, reasoning)
    VALUES (
      p_experience_id,
      cluster_id,
      CASE
        WHEN jsonb_typeof(assignment->'confidence') = 'number'
        THEN (assignment->>'confidence')::double precision
        ELSE 0
      END,
      assignment->>'reasoning'
    )
    ON CONFLICT (experience_id, cluster_id) DO NOTHING
    RETURNING experience_id INTO newly_mapped;

    IF newly_mapped IS NOT NULL THEN
      PERFORM public.increment_cluster_count(cluster_id);
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION classify_experience_atomic(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION classify_experience_atomic(UUID, JSONB) TO authenticated;

-- get_unclassified_experiences
CREATE OR REPLACE FUNCTION get_unclassified_experiences(
  p_user_id UUID,
  p_limit   INT DEFAULT 10
)
RETURNS TABLE (
  id                 UUID,
  user_id            UUID,
  logged_at          DATE,
  description        TEXT,
  goal               TEXT,
  action             TEXT,
  emotion            TEXT,
  context            TEXT,
  trigger            TEXT,
  outcome            TEXT,
  emotion_level      SMALLINT,
  stress_level       SMALLINT,
  domain_id          UUID,
  tags               TEXT[],
  action_result      TEXT,
  action_memo        TEXT,
  created_at         TIMESTAMPTZ,
  domain_description TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
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
    e.created_at,
    d.description AS domain_description
  FROM public.experiences e
  LEFT JOIN public.domains d ON d.id = e.domain_id
  WHERE e.user_id = p_user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.experience_cluster_map ecm
      WHERE ecm.experience_id = e.id
    )
  ORDER BY e.created_at DESC
  LIMIT p_limit;
$$;

-- ============================================================
-- 15. Trigger: on_auth_user_created
-- ============================================================
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 16. Backfill existing auth.users
-- ============================================================
INSERT INTO public.users (id, display_name)
SELECT au.id, au.raw_user_meta_data ->> 'display_name'
FROM auth.users AS au
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 17. View: v_user_llm_usage (012 final version)
-- ============================================================
CREATE OR REPLACE VIEW v_user_llm_usage WITH (security_invoker = true) AS
SELECT
  m.user_id,
  lm.name                                                              AS model_name,
  COUNT(*)::INT                                                        AS total_messages,
  COALESCE(SUM(CASE WHEN m.role = 'user'      THEN m.token_count END), 0)::BIGINT
                                                                       AS total_input_tokens,
  COALESCE(SUM(CASE WHEN m.role = 'assistant' THEN m.token_count END), 0)::BIGINT
                                                                       AS total_output_tokens,
  ROUND(
    SUM(
      CASE
        WHEN m.unit_price  IS NULL OR m.token_count IS NULL
        THEN NULL
        ELSE m.token_count * m.unit_price
      END
    ) / 1000000.0,
    6
  )                                                                    AS estimated_cost_usd,
  MIN(m.created_at)                                                    AS first_used_at,
  MAX(m.created_at)                                                    AS last_used_at
FROM messages m
JOIN llm_models lm ON lm.id = m.model_id
WHERE m.model_id IS NOT NULL
GROUP BY m.user_id, lm.id, lm.name;

REVOKE SELECT ON v_user_llm_usage FROM anon;
GRANT  SELECT ON v_user_llm_usage TO authenticated;

COMMIT;
