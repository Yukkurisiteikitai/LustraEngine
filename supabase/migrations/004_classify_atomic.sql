-- 体験のクラスター分類を原子的に行うRPC
CREATE OR REPLACE FUNCTION classify_experience_atomic(
  p_user_id UUID,
  p_experience_id UUID,
  p_assignments JSONB
) RETURNS VOID AS $$
DECLARE
  assignment JSONB;
  cluster_id UUID;
BEGIN
  FOR assignment IN SELECT * FROM jsonb_array_elements(p_assignments) LOOP
    -- cluster upsert
    INSERT INTO episode_clusters (user_id, cluster_type, label, description, last_detected_at)
    VALUES (
      p_user_id,
      assignment->>'clusterType',
      assignment->>'label',
      assignment->>'description',
      NOW()
    )
    ON CONFLICT (user_id, cluster_type)
    DO UPDATE SET label = EXCLUDED.label, last_detected_at = NOW()
    RETURNING id INTO cluster_id;

    -- mapping insert (ignore duplicate)
    INSERT INTO experience_cluster_map (experience_id, cluster_id, confidence, reasoning)
    VALUES (
      p_experience_id,
      cluster_id,
      (assignment->>'confidence')::FLOAT,
      assignment->>'reasoning'
    )
    ON CONFLICT (experience_id, cluster_id) DO NOTHING;

    -- counter increment (既存RPC再利用)
    PERFORM increment_cluster_count(cluster_id);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
