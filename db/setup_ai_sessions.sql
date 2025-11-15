-- AI Sessions Table
-- Tracks AI voice conversation usage time for analytics and billing
-- Run this SQL in your Supabase SQL Editor or via database migration

CREATE TABLE IF NOT EXISTS ai_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMP
);

-- Add index for efficient queries by user and time range
CREATE INDEX IF NOT EXISTS idx_ai_sessions_user_id_started_at 
  ON ai_sessions(user_id, started_at DESC);

-- Add index for finding incomplete sessions
CREATE INDEX IF NOT EXISTS idx_ai_sessions_ended_at 
  ON ai_sessions(ended_at) 
  WHERE ended_at IS NULL;

-- Example query to calculate session durations
-- SELECT 
--   id, 
--   user_id, 
--   started_at, 
--   ended_at,
--   EXTRACT(EPOCH FROM (ended_at - started_at)) AS duration_seconds
-- FROM ai_sessions 
-- WHERE ended_at IS NOT NULL
-- ORDER BY started_at DESC;
