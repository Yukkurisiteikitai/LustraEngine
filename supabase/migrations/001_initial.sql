-- Phase 1: Initial schema for YourselfLM
-- 3 tables: users, domains, experiences

-- ============================================================
-- users（Supabase Auth 連携）
-- ============================================================
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own" ON users
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_insert_own" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- domains（ユーザー定義可能）
-- ============================================================
CREATE TABLE domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

ALTER TABLE domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "domains_select_own" ON domains
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "domains_insert_own" ON domains
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "domains_update_own" ON domains
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "domains_delete_own" ON domains
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- experiences（構造化 experience — episode clustering の基盤）
-- ============================================================
CREATE TABLE experiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  logged_at DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,

  -- 構造化フィールド（認知科学モデル準拠）
  -- user input fields
  goal TEXT,                -- 何をしようとしていたか（例: 英検の勉強）
  action TEXT,              -- 実際に何をしたか（例: YouTubeを見た）
  emotion TEXT,             -- どう感じたか（例: 自己嫌悪）
  context TEXT,             -- 状況・文脈（例: 夜、一人で部屋にいた）
  -- system inference fields（MVP では任意、研究段階で自動推定）
  trigger TEXT,             -- 行動のきっかけ（例: ストレス）
  outcome TEXT,             -- 結果（例: 未完了）

  emotion_level SMALLINT CHECK (emotion_level BETWEEN 1 AND 5),
  stress_level SMALLINT NOT NULL CHECK (stress_level BETWEEN 1 AND 5),
  domain_id UUID REFERENCES domains(id) ON DELETE SET NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  action_result TEXT NOT NULL CHECK (action_result IN ('AVOIDED', 'CONFRONTED')),
  action_memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE experiences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "experiences_select_own" ON experiences
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "experiences_insert_own" ON experiences
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "experiences_update_own" ON experiences
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "experiences_delete_own" ON experiences
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- indexes
-- ============================================================
CREATE INDEX idx_experiences_user_logged ON experiences(user_id, logged_at DESC);
CREATE INDEX idx_domains_user ON domains(user_id);

-- ============================================================
-- auto-create user profile on signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'display_name');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Backfill existing auth users (users created before this migration)
INSERT INTO public.users (id, display_name)
SELECT au.id, au.raw_user_meta_data ->> 'display_name'
FROM auth.users AS au
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- seed default domains（signup 時にコピーする用のテンプレート）
-- ============================================================
-- Note: 実際のユーザードメインは signup 後に insert する。
-- ここではテンプレートとして参照用のコメントのみ:
-- 仕事, 人間関係, 健康, お金, 自分
