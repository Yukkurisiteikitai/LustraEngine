-- threads: one conversation session per row
CREATE TABLE threads (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT        NOT NULL DEFAULT '新しいチャット',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_threads" ON threads FOR ALL USING (user_id = auth.uid());
CREATE INDEX threads_user_created ON threads(user_id, created_at DESC);

-- messages: each turn (user or assistant) in a thread
-- contexts TEXT[] holds multiple AI responses for rethink support
-- context_id_set points to the currently displayed context index
CREATE TABLE messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id       UUID        NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  contexts        TEXT[]      NOT NULL DEFAULT '{}',
  context_id_set  INT         NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_messages" ON messages FOR ALL USING (user_id = auth.uid());
CREATE INDEX messages_thread_created ON messages(thread_id, created_at ASC);

-- RPC: append a new context to a message and advance context_id_set
CREATE OR REPLACE FUNCTION append_message_context(
  p_message_id UUID,
  p_new_context TEXT
)
RETURNS messages
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_row messages;
BEGIN
  UPDATE messages
  SET
    contexts       = array_append(contexts, p_new_context),
    context_id_set = array_length(array_append(contexts, p_new_context), 1) - 1
  WHERE id = p_message_id
    AND user_id = auth.uid()
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'message not found or access denied';
  END IF;

  RETURN v_row;
END;
$$;
