BEGIN;

-- 1. Create pair_nodes (idempotent)
CREATE TABLE IF NOT EXISTS pair_nodes (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id         UUID        NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  select_message_id UUID,       -- FK added in step 6 to avoid circular ref at insert
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Add new columns to messages (idempotent)
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS pair_node_id UUID REFERENCES pair_nodes(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS content      TEXT;

-- Make thread_id nullable only while it still has NOT NULL constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'thread_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE messages ALTER COLUMN thread_id DROP NOT NULL;
  END IF;
END;
$$;

-- 3. Data migration: pair consecutive user+assistant rows per thread.
--    Guarded by whether thread_id column still exists and there are
--    unmigrated rows (pair_node_id IS NULL), so safe to re-run.
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
  -- Skip entirely if thread_id was already dropped
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'thread_id'
  ) THEN
    RETURN;
  END IF;

  FOR t IN
    SELECT DISTINCT thread_id
    FROM messages
    WHERE thread_id IS NOT NULL AND pair_node_id IS NULL
  LOOP
    FOR u IN
      SELECT * FROM messages
      WHERE thread_id = t.thread_id AND role = 'user' AND pair_node_id IS NULL
      ORDER BY created_at
    LOOP
      INSERT INTO pair_nodes(user_id, thread_id, created_at)
      VALUES (u.user_id, t.thread_id, u.created_at)
      RETURNING id INTO pn_id;

      -- COALESCE guards against empty contexts array (contexts[1] = NULL)
      UPDATE messages
      SET pair_node_id = pn_id,
          content      = COALESCE(contexts[1], '')
      WHERE id = u.id;

      SELECT * INTO a FROM messages
      WHERE thread_id = t.thread_id
        AND role = 'assistant'
        AND created_at > u.created_at
        AND pair_node_id IS NULL
      ORDER BY created_at
      LIMIT 1;

      IF FOUND THEN
        ci := 0;
        sel := NULL;
        FOREACH ctx IN ARRAY a.contexts LOOP
          -- token_count / model_id / unit_price omitted: may not exist on all DB
          -- states (migrations 009/012 optional). Backfill separately if needed.
          INSERT INTO messages(user_id, pair_node_id, role, content, created_at)
          VALUES (a.user_id, pn_id, 'assistant', ctx,
                  a.created_at + (ci || ' microseconds')::interval)
          RETURNING id INTO m_id;
          IF ci = a.context_id_set THEN sel := m_id; END IF;
          ci := ci + 1;
        END LOOP;

        DELETE FROM messages WHERE id = a.id;
        UPDATE pair_nodes SET select_message_id = sel WHERE id = pn_id;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- 4. Drop old columns (idempotent)
ALTER TABLE messages
  DROP COLUMN IF EXISTS thread_id,
  DROP COLUMN IF EXISTS contexts,
  DROP COLUMN IF EXISTS context_id_set;

-- 5. Delete orphan rows and enforce NOT NULL
DELETE FROM messages WHERE pair_node_id IS NULL;
ALTER TABLE messages ALTER COLUMN pair_node_id SET NOT NULL;

-- Replace NULL content (edge: empty contexts[] in legacy data)
UPDATE messages SET content = '' WHERE content IS NULL;
ALTER TABLE messages ALTER COLUMN content SET NOT NULL;

-- 6. Add FK pair_nodes → messages (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pair_nodes_select_fkey'
  ) THEN
    ALTER TABLE pair_nodes
      ADD CONSTRAINT pair_nodes_select_fkey
      FOREIGN KEY (select_message_id) REFERENCES messages(id) ON DELETE SET NULL;
  END IF;
END;
$$;

-- 7. RLS (idempotent)
ALTER TABLE pair_nodes ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'pair_nodes' AND policyname = 'users_own_pair_nodes'
  ) THEN
    CREATE POLICY "users_own_pair_nodes" ON pair_nodes
      FOR ALL USING (user_id = auth.uid());
  END IF;
END;
$$;

-- 8. Indexes (idempotent)
DROP INDEX IF EXISTS messages_thread_created;
CREATE INDEX IF NOT EXISTS pair_nodes_thread_created ON pair_nodes(thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS messages_pair_node ON messages(pair_node_id, created_at ASC);

-- 9. Drop old RPC (replaced by app-layer select_message_id update)
DROP FUNCTION IF EXISTS append_message_context(UUID, TEXT);

COMMIT;
