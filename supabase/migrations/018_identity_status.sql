CREATE TABLE identity_status (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Marciaの4ステータスをドメインごとに記録
  domain     TEXT NOT NULL CHECK (domain IN (
    'career', 'values', 'relationships', 'interests'
  )),

  -- 探索度（0〜1）・コミットメント度（0〜1）
  exploration_score  REAL CHECK (exploration_score BETWEEN 0 AND 1),
  commitment_score   REAL CHECK (commitment_score BETWEEN 0 AND 1),

  -- 4ステータスへのマッピング
  status TEXT CHECK (status IN (
    'achievement',   -- 達成：探索済み＋コミット済み
    'moratorium',    -- モラトリアム：探索中
    'foreclosure',   -- 早期完了：探索なし＋コミット済み（親の価値観の押し付け等）
    'diffusion'      -- 拡散：探索なし＋コミットなし
  )),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, domain)
);

ALTER TABLE identity_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_identity_status" ON identity_status
  FOR ALL USING (user_id = auth.uid());