ALTER TABLE experiences

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
  ADD COLUMN psychology_analyzed_at TIMESTAMPTZ;