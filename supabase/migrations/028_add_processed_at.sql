-- Add processed_at column to experiences table
-- This column tracks when a log entry has been processed by analysis jobs
-- NULL means not yet analyzed
-- Non-NULL timestamp means analyzed by daily/full_3months jobs

ALTER TABLE experiences
ADD COLUMN IF NOT EXISTS processed_at timestamptz NULL;

-- Optional: Index for querying unprocessed experiences
CREATE INDEX IF NOT EXISTS idx_experiences_processed_at
ON experiences(user_id, processed_at);
