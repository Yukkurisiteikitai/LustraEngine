BEGIN;

-- Remove insecure 3-arg overload from migration 004 (PostgreSQL overloads by signature)
DROP FUNCTION IF EXISTS classify_experience_atomic(UUID, UUID, JSONB);

CREATE OR REPLACE FUNCTION classify_experience_atomic(
  p_experience_id UUID,
  p_assignments   JSONB
) RETURNS VOID AS $$
DECLARE
  assignment   JSONB;
  cluster_id   UUID;
  newly_mapped UUID;   -- NULL if ON CONFLICT skipped the insert
BEGIN
  -- Guard: reject anonymous calls (SQLSTATE 28000 = invalid_authorization_specification)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  -- Guard: IS DISTINCT FROM catches both NULL and non-array values
  IF jsonb_typeof(p_assignments) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_assignments must be a JSON array';
  END IF;

  -- Ownership check: caller must own the experience
  IF NOT EXISTS (
    SELECT 1 FROM public.experiences
    WHERE id = p_experience_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'experience not found or access denied';
  END IF;

  FOR assignment IN SELECT * FROM jsonb_array_elements(p_assignments) LOOP
    -- Validate required field before any DML
    IF assignment->>'clusterType' IS NULL OR assignment->>'clusterType' = '' THEN
      RAISE EXCEPTION 'clusterType is required';
    END IF;

    -- Upsert cluster row; always returns the id (insert or update)
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

    -- Use RETURNING to detect real inserts vs conflict skips.
    -- ON CONFLICT DO NOTHING returns no rows → newly_mapped stays NULL.
    -- Safe confidence cast: LLM responses may include non-numeric values.
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

    -- Only increment when a new mapping was actually created
    IF newly_mapped IS NOT NULL THEN
      PERFORM public.increment_cluster_count(cluster_id);
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Restrict execution: deny PUBLIC, grant only to authenticated role
REVOKE ALL ON FUNCTION classify_experience_atomic(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION classify_experience_atomic(UUID, JSONB) TO authenticated;

COMMIT;
