-- cluster_typeのCHECK制約を削除し、自由なラベルを許容する
ALTER TABLE episode_clusters
  DROP CONSTRAINT episode_clusters_cluster_type_check;

-- 代わりにcategoryカラムを追加して理論的分類を保持
ALTER TABLE episode_clusters
  ADD COLUMN theory_category TEXT CHECK (theory_category IN (
    'cognitive_distortion',   -- 認知行動理論：認知の歪み
    'attachment_pattern',     -- 愛着理論：対人パターン
    'motivation_pattern',     -- 自己決定理論：動機づけパターン
    'narrative_theme',        -- ナラティブ理論：物語テーマ
    'behavioral_pattern'      -- 行動パターン（既存4種を包含）
  )),
  ADD COLUMN theory_source TEXT; -- 'CBT' / 'attachment' / 'SDT' / 'narrative'-- Big Fiveの因子スコアを保持する新テーブル
CREATE TABLE big_five_scores (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- 5因子スコア（0〜1、0.5が平均的）
  openness          REAL CHECK (openness BETWEEN 0 AND 1),
  conscientiousness REAL CHECK (conscientiousness BETWEEN 0 AND 1),
  extraversion      REAL CHECK (extraversion BETWEEN 0 AND 1),
  agreeableness     REAL CHECK (agreeableness BETWEEN 0 AND 1),
  neuroticism       REAL CHECK (neuroticism BETWEEN 0 AND 1),

  -- 信頼度（エビデンスが少ない初期は低い）
  confidence        REAL DEFAULT 0.1 CHECK (confidence BETWEEN 0 AND 1),

  -- エビデンスとして使ったexperience件数
  evidence_count    INT DEFAULT 0,

  -- WEIRDバイアス補正フラグ
  -- trueのとき「自律性＝良い」などの西洋的解釈を避けた出力を使う
  apply_cultural_adjustment BOOLEAN DEFAULT true,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Big Fiveのファセットスコア（より細かい次元）
CREATE TABLE big_five_facets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain     TEXT NOT NULL CHECK (domain IN (
    'openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'
  )),
  facet_name TEXT NOT NULL,
  -- 例: openness → 'intellectual_curiosity', 'aesthetic_sensitivity', 'creative_imagination'
  score      REAL CHECK (score BETWEEN 0 AND 1),
  confidence REAL DEFAULT 0.1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, domain, facet_name)
);ALTER TABLE experiences

  -- ナラティブ分析（McAdams）
  ADD COLUMN narrative_sequence TEXT CHECK (narrative_sequence IN (
    'redemption',    -- 悪→良への転換「結果的によかった」
    'contamination', -- 良→悪への転換「台無しになった」
    'stable',        -- 変化なし
    'unknown'
  )),
  ADD COLUMN agency_score  SMALLINT CHECK (agency_score BETWEEN 0 AND 5),
  -- 自己決定・達成・コントロールの表現度
  ADD COLUMN communion_score SMALLINT CHECK (communion_score BETWEEN 0 AND 5),
  -- つながり・愛・所属の表現度

  -- 帰属理論（Weiner）：成功・失敗の原因帰属
  ADD COLUMN attribution_locus TEXT CHECK (attribution_locus IN (
    'internal', 'external'
  )),
  ADD COLUMN attribution_stability TEXT CHECK (attribution_stability IN (
    'stable', 'unstable'
  )),
  ADD COLUMN attribution_controllability TEXT CHECK (attribution_controllability IN (
    'controllable', 'uncontrollable'
  )),

  -- 認知の歪み（Beck）：検出されたパターン
  ADD COLUMN cognitive_distortions TEXT[] DEFAULT '{}',
  -- 例: ['all_or_nothing', 'catastrophizing', 'should_statements']

  -- 報告難易度（あなたが独自に定義していた概念）
  ADD COLUMN disclosure_difficulty SMALLINT CHECK (disclosure_difficulty BETWEEN 1 AND 5),
  -- 1=簡単に話せる / 5=かなり話しにくい

  -- LLMによる分析済みフラグ
  ADD COLUMN psychology_analyzed_at TIMESTAMPTZ;CREATE TABLE attachment_profile (
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
  FOR ALL USING (user_id = auth.uid());CREATE TABLE identity_status (
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