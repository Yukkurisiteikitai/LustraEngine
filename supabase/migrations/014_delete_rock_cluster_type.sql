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
  ADD COLUMN theory_source TEXT; -- 'CBT' / 'attachment' / 'SDT' / 'narrative'