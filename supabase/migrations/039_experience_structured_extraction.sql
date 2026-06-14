-- ============================================================
-- 039_experience_structured_extraction
-- LLM-1 (free-text diary → structured fields) を支えるためのスキーマ拡張
--   * action_result を 4 値化（既存 'CONFRONTED' は CONFRONTED_SUCCESS に一括変換）
--   * emotions JSONB を追加（既存 emotion TEXT は後方互換のため残置）
--   * time_of_day enum / duration_minutes を追加
-- 関連: scripts/llm1_prompt.py の出力スキーマと完全に一致させること
-- ============================================================

BEGIN;

-- ---- action_result -----------------------------------------------------
UPDATE public.experiences
   SET action_result = 'CONFRONTED_SUCCESS'
 WHERE action_result = 'CONFRONTED';

ALTER TABLE public.experiences
  DROP CONSTRAINT IF EXISTS experiences_action_result_check;

ALTER TABLE public.experiences
  ADD CONSTRAINT experiences_action_result_check
  CHECK (action_result IN (
    'CONFRONTED_SUCCESS',
    'CONFRONTED_FAILED',
    'AVOIDED',
    'PARTIAL'
  ));

COMMENT ON COLUMN public.experiences.action_result IS
  '4-valued result of facing the obstacle. CONFRONTED was migrated to CONFRONTED_SUCCESS in 039.';

-- ---- emotions (structured) ---------------------------------------------
ALTER TABLE public.experiences
  ADD COLUMN IF NOT EXISTS emotions JSONB;

COMMENT ON COLUMN public.experiences.emotions IS
  'Array of {label:string, intensity:1..5}. Populated by LLM-1 extraction. Legacy emotion TEXT column kept for read-back compat.';

-- ---- time_of_day enum --------------------------------------------------
DO $$
BEGIN
  CREATE TYPE time_of_day_enum AS ENUM ('morning', 'afternoon', 'evening', 'night');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE public.experiences
  ADD COLUMN IF NOT EXISTS time_of_day time_of_day_enum;

-- ---- duration_minutes --------------------------------------------------
ALTER TABLE public.experiences
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER
    CHECK (duration_minutes IS NULL OR duration_minutes >= 0);

COMMENT ON COLUMN public.experiences.duration_minutes IS
  'How long the activity took, in minutes. NULL when unknown.';

COMMIT;
