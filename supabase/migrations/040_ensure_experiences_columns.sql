-- ============================================================
-- 040_ensure_experiences_columns
-- migration 034 / 039 で追加されたはずの列を IF NOT EXISTS で再保証し
-- PostgREST schema cache を supabase db push 経由でリロードする。
-- 実際に列が存在する環境では全て no-op になる。
--
-- 背景: PGRST204 "Could not find the 'careful' column of 'experiences'
-- in the schema cache" が発生。migration 034 で追加されたが
-- PostgREST の schema cache がスタールになっていた。
-- ============================================================

BEGIN;

-- migration 034 の列（schema cache への再認識が必要）
ALTER TABLE public.experiences
  ADD COLUMN IF NOT EXISTS report_difficulty smallint NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS careful boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS soft_deleted_at timestamptz NULL;

-- migration 039 の列（念のため保証）
ALTER TABLE public.experiences
  ADD COLUMN IF NOT EXISTS emotions JSONB,
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER
    CHECK (duration_minutes IS NULL OR duration_minutes >= 0);

COMMIT;
