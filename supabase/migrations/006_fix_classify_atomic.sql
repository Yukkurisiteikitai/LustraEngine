-- Fix: p_user_id spoofing vulnerability, search_path injection, double counter increment
CREATE OR REPLACE FUNCTION classify_experience_atomic(
  p_experience_id UUID,
  p_assignments JSONB
) RETURNS VOID AS $$
DECLARE
  assignment JSONB;
  cluster_id UUID;
  rows_inserted INT;
BEGIN
  FOR assignment IN SELECT * FROM jsonb_array_elements(p_assignments) LOOP
    INSERT INTO episode_clusters (user_id, cluster_type, label, description, last_detected_at)
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

    INSERT INTO experience_cluster_map (experience_id, cluster_id, confidence, reasoning)
    VALUES (
      p_experience_id,
      cluster_id,
      (assignment->>'confidence')::FLOAT,
      assignment->>'reasoning'
    )
    ON CONFLICT (experience_id, cluster_id) DO NOTHING;

    GET DIAGNOSTICS rows_inserted = ROW_COUNT;
    IF rows_inserted > 0 THEN
      PERFORM increment_cluster_count(cluster_id);
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
