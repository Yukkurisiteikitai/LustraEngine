-- Big Fiveの因子スコアを保持する新テーブル
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
);