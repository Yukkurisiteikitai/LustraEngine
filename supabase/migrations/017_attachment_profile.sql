CREATE TABLE attachment_profile (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- 愛着理論（Bartholomew & Horowitz）：2次元モデル
  -- 各スコアは1〜7（ECR-R尺度準拠）
  anxiety_score   REAL CHECK (anxiety_score BETWEEN 1 AND 7),
  -- 高い＝見捨てられ不安が強い
  avoidance_score REAL CHECK (avoidance_score BETWEEN 1 AND 7),
  -- 高い＝他者への回避傾向

  -- 4スタイルへのマッピング（補助的）
  style TEXT CHECK (style IN (
    'secure',     -- 安全型：低不安・低回避
    'preoccupied', -- とらわれ型：高不安・低回避
    'dismissing',  -- 拒絶型：低不安・高回避
    'fearful'      -- 恐れ型：高不安・高回避
  )),

  confidence      REAL DEFAULT 0.1,
  evidence_count  INT  DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE attachment_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_attachment" ON attachment_profile
  FOR ALL USING (user_id = auth.uid());