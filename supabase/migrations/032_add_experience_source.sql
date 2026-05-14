ALTER TABLE experiences
  ADD COLUMN IF NOT EXISTS source TEXT;

COMMENT ON COLUMN experiences.source IS 'Origin of the evidence entry, e.g. chat_fallback';
