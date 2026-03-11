-- 1. Create pair_nodes (no FK to messages yet — circular ref)
CREATE TABLE pair_nodes (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id         UUID        NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  select_message_id UUID,       -- FK added after messages migration
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Add new columns to messages (nullable during migration)
ALTER TABLE messages
  ADD COLUMN pair_node_id UUID REFERENCES pair_nodes(id) ON DELETE CASCADE,
  ADD COLUMN content      TEXT;

-- 3. Data migration: pair consecutive user+assistant rows per thread
DO $$
DECLARE
  t     RECORD;
  u     RECORD;
  a     RECORD;
  pn_id UUID;
  ctx   TEXT;
  ci    INT;
  m_id  UUID;
  sel   UUID;
BEGIN
  FOR t IN SELECT DISTINCT thread_id FROM messages LOOP
    FOR u IN
      SELECT * FROM messages
      WHERE thread_id = t.thread_id AND role = 'user'
      ORDER BY created_at
    LOOP
      -- Create pair_node for this user turn
      INSERT INTO pair_nodes(user_id, thread_id, created_at)
      VALUES (u.user_id, t.thread_id, u.created_at)
      RETURNING id INTO pn_id;

      -- Migrate user message (contexts[1] is 1-indexed in postgres)
      UPDATE messages
      SET pair_node_id = pn_id,
          content      = contexts[1]
      WHERE id = u.id;

      -- Find next assistant message in same thread
      SELECT * INTO a FROM messages
      WHERE thread_id = t.thread_id
        AND role = 'assistant'
        AND created_at > u.created_at
      ORDER BY created_at
      LIMIT 1;

      IF FOUND THEN
        ci := 0;
        sel := NULL;
        FOREACH ctx IN ARRAY a.contexts LOOP
          INSERT INTO messages(user_id, pair_node_id, role, content,
                               token_count, model_id, unit_price, created_at)
          VALUES (a.user_id, pn_id, 'assistant', ctx,
                  CASE WHEN ci = 0 THEN a.token_count ELSE NULL END,
                  CASE WHEN ci = 0 THEN a.model_id   ELSE NULL END,
                  CASE WHEN ci = 0 THEN a.unit_price  ELSE NULL END,
                  a.created_at + (ci || ' microseconds')::interval)
          RETURNING id INTO m_id;
          IF ci = a.context_id_set THEN sel := m_id; END IF;
          ci := ci + 1;
        END LOOP;

        -- Remove the original assistant row (re-created per-context above)
        DELETE FROM messages WHERE id = a.id;

        UPDATE pair_nodes SET select_message_id = sel WHERE id = pn_id;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- 4. Drop old columns
ALTER TABLE messages
  DROP COLUMN thread_id,
  DROP COLUMN contexts,
  DROP COLUMN context_id_set;

-- 5. Delete orphan rows (messages without pair_node_id) and enforce NOT NULL
DELETE FROM messages WHERE pair_node_id IS NULL;
ALTER TABLE messages ALTER COLUMN pair_node_id SET NOT NULL;
ALTER TABLE messages ALTER COLUMN content      SET NOT NULL;

-- 6. Add FK pair_nodes → messages (now safe, no circular ref at insert time)
ALTER TABLE pair_nodes
  ADD CONSTRAINT pair_nodes_select_fkey
  FOREIGN KEY (select_message_id) REFERENCES messages(id) ON DELETE SET NULL;

-- 7. RLS
ALTER TABLE pair_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_pair_nodes" ON pair_nodes
  FOR ALL USING (user_id = auth.uid());

-- 8. Indexes
DROP INDEX IF EXISTS messages_thread_created;
CREATE INDEX pair_nodes_thread_created ON pair_nodes(thread_id, created_at ASC);
CREATE INDEX messages_pair_node ON messages(pair_node_id, created_at ASC);

-- 9. Drop old RPC (replaced by app-layer select_message_id update)
DROP FUNCTION IF EXISTS append_message_context(UUID, TEXT);
