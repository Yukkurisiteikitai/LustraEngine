-- persona_snapshots にバージョン追跡を追加
ALTER TABLE persona_snapshots
  ADD COLUMN IF NOT EXISTS traits_hash TEXT,
  ADD COLUMN IF NOT EXISTS version SERIAL;

CREATE INDEX IF NOT EXISTS idx_persona_snapshots_user_created
  ON persona_snapshots (user_id, created_at DESC);
