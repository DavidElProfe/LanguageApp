-- AI Session Messages Table
-- Records conversation transcripts for AI voice conversations
-- Run this SQL in your Supabase SQL Editor or via database migration

CREATE TABLE IF NOT EXISTS ai_session_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES ai_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL, -- "user" | "assistant"
  content TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add index for efficient message retrieval by session
CREATE INDEX IF NOT EXISTS idx_ai_session_messages_session_id_created_at 
  ON ai_session_messages(session_id, created_at ASC);

-- Example query to view conversation transcript for a session
-- SELECT 
--   id,
--   role,
--   content,
--   created_at
-- FROM ai_session_messages 
-- WHERE session_id = 'your-session-id-here'
-- ORDER BY created_at ASC;

-- Example query to get recent conversations with message counts
-- SELECT 
--   s.id AS session_id,
--   s.user_id,
--   s.started_at,
--   s.ended_at,
--   COUNT(m.id) AS message_count,
--   ARRAY_AGG(m.role ORDER BY m.created_at) AS roles
-- FROM ai_sessions s
-- LEFT JOIN ai_session_messages m ON m.session_id = s.id
-- GROUP BY s.id
-- ORDER BY s.started_at DESC
-- LIMIT 10;
