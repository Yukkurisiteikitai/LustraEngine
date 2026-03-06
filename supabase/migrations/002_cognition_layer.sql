-- L3 Cognition Layer: pattern detection tables

-- episode_clusters: one row per user per cluster type (UPSERT-friendly)
CREATE TABLE episode_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cluster_type TEXT NOT NULL CHECK (cluster_type IN (
    'procrastination', 'social_avoidance', 'authority_anxiety', 'perfectionism'
  )),
  label TEXT NOT NULL,
  description TEXT,
  strength SMALLINT DEFAULT 1 CHECK (strength BETWEEN 1 AND 10),
  detected_count INT DEFAULT 0,
  last_detected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, cluster_type)
);

ALTER TABLE episode_clusters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own clusters"
  ON episode_clusters FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own clusters"
  ON episode_clusters FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own clusters"
  ON episode_clusters FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own clusters"
  ON episode_clusters FOR DELETE
  USING (user_id = auth.uid());

-- experience_cluster_map: many-to-many (one experience → 0-2 clusters)
CREATE TABLE experience_cluster_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id UUID NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  cluster_id UUID NOT NULL REFERENCES episode_clusters(id) ON DELETE CASCADE,
  confidence REAL CHECK (confidence BETWEEN 0 AND 1),
  reasoning TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(experience_id, cluster_id)
);

ALTER TABLE experience_cluster_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own experience cluster maps"
  ON experience_cluster_map FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM experiences e
      WHERE e.id = experience_cluster_map.experience_id
        AND e.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own experience cluster maps"
  ON experience_cluster_map FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM experiences e
      WHERE e.id = experience_cluster_map.experience_id
        AND e.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own experience cluster maps"
  ON experience_cluster_map FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM experiences e
      WHERE e.id = experience_cluster_map.experience_id
        AND e.user_id = auth.uid()
    )
  );

-- cluster_edges: pattern causality graph
CREATE TABLE cluster_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_cluster_id UUID NOT NULL REFERENCES episode_clusters(id) ON DELETE CASCADE,
  target_cluster_id UUID NOT NULL REFERENCES episode_clusters(id) ON DELETE CASCADE,
  edge_type TEXT NOT NULL DEFAULT 'leads_to'
    CHECK (edge_type IN ('leads_to', 'triggers', 'reinforces')),
  weight REAL DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, source_cluster_id, target_cluster_id)
);

ALTER TABLE cluster_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cluster edges"
  ON cluster_edges FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own cluster edges"
  ON cluster_edges FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own cluster edges"
  ON cluster_edges FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own cluster edges"
  ON cluster_edges FOR DELETE
  USING (user_id = auth.uid());

-- Helper: atomic counter increment
CREATE OR REPLACE FUNCTION increment_cluster_count(p_cluster_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  UPDATE public.episode_clusters
  SET detected_count = detected_count + 1, updated_at = now()
  WHERE id = p_cluster_id AND user_id = auth.uid();
END;
$$;
