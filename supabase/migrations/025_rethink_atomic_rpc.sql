CREATE OR REPLACE FUNCTION rethink_pair_node(
  p_pair_node_id uuid,
  p_user_id uuid,
  p_content text,
  p_current_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_message_id uuid;
  v_rows_updated integer;
BEGIN
  -- Insert new assistant message
  INSERT INTO messages (pair_node_id, user_id, role, content)
  VALUES (p_pair_node_id, p_user_id, 'assistant', p_content)
  RETURNING id INTO v_new_message_id;

  -- OCC update: only succeeds if version matches
  UPDATE pair_nodes
  SET select_message_id = v_new_message_id,
      version = p_current_version + 1
  WHERE id = p_pair_node_id
    AND version = p_current_version;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    -- Version mismatch: rollback the message insert and signal conflict
    RAISE EXCEPTION 'concurrency_conflict' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object('messageId', v_new_message_id);
END;
$$;
