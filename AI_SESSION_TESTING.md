# AI Session Tracking - Testing Guide

## System Overview

**La Escuela de Idiomas** tracks AI voice conversation sessions in **Replit PostgreSQL**, NOT Supabase.

### Database Architecture

| Database | Purpose | What's Stored |
|----------|---------|---------------|
| **Supabase** | Authentication ONLY | User accounts, login sessions |
| **Replit PostgreSQL** | Application Data | Courses, progress, **AI sessions**, **AI messages** |

## What Gets Tracked

When a user has an AI conversation, the system automatically records:

### 1. Session Data (`ai_sessions` table)
- ✅ **WHO**: `user_id` (linked to profiles table)
- ✅ **WHEN**: `started_at` timestamp
- ✅ **HOW LONG**: `ended_at` timestamp (duration = ended_at - started_at)

### 2. Conversation Transcript (`ai_session_messages` table)
- ✅ **FULL CONVERSATION**: Every message saved with:
  - `role`: "user" or "assistant"
  - `content`: The actual text of what was said
  - `created_at`: When the message was sent
  - `session_id`: Links back to the session

## How to Test

### Step 1: Start an AI Conversation

1. Log in to the app (or create an account)
2. Go to the AI Chat page (default landing page)
3. Click "Comenzar Conversación" to start talking
4. Have a short conversation (say a few sentences, wait for AI responses)
5. Click "Finalizar" to end the conversation

### Step 2: Check Session Was Created

Open the Replit Database Console and run:

```sql
-- View all AI sessions with user info
SELECT 
  s.id as session_id,
  p.display_name as user_name,
  s.user_id,
  s.started_at,
  s.ended_at,
  EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) as duration_seconds
FROM ai_sessions s
JOIN profiles p ON s.user_id = p.id
ORDER BY s.started_at DESC
LIMIT 10;
```

**Expected Result**: You should see a row with:
- Your user ID
- Start timestamp
- End timestamp
- Duration in seconds

### Step 3: Check Conversation Was Recorded

```sql
-- View conversation messages for latest session
SELECT 
  m.created_at,
  m.role,
  m.content,
  p.display_name
FROM ai_session_messages m
JOIN ai_sessions s ON m.session_id = s.id
JOIN profiles p ON s.user_id = p.id
WHERE s.id = 'PASTE_SESSION_ID_FROM_STEP_2_HERE'
ORDER BY m.created_at ASC;
```

**Expected Result**: You should see alternating user/assistant messages matching your conversation.

### Step 4: Verify Browser Console Logs

Open browser DevTools (F12) → Console tab. You should see:

```
✅ AI session started: [uuid-here]
✅ AI session ended: [uuid-here]
```

If you see warnings like:
- ⚠️ "Failed to create AI session record" → The database table might not exist
- ⚠️ "No auth session" → User is not logged in

## Analytics Queries

### Total Usage by User

```sql
SELECT 
  p.display_name,
  p.id as user_id,
  COUNT(s.id) as total_sessions,
  SUM(EXTRACT(EPOCH FROM (s.ended_at - s.started_at))) as total_seconds,
  AVG(EXTRACT(EPOCH FROM (s.ended_at - s.started_at))) as avg_session_seconds
FROM profiles p
LEFT JOIN ai_sessions s ON s.user_id = p.id
WHERE s.ended_at IS NOT NULL
GROUP BY p.id, p.display_name
ORDER BY total_seconds DESC;
```

### Recent Conversations with Message Counts

```sql
SELECT 
  s.id as session_id,
  p.display_name,
  s.started_at,
  s.ended_at,
  EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) as duration_seconds,
  COUNT(m.id) as message_count
FROM ai_sessions s
JOIN profiles p ON s.user_id = p.id
LEFT JOIN ai_session_messages m ON m.session_id = s.id
GROUP BY s.id, p.display_name, s.started_at, s.ended_at
ORDER BY s.started_at DESC
LIMIT 20;
```

### View Full Conversation Transcript

```sql
SELECT 
  p.display_name,
  s.started_at as session_start,
  m.created_at,
  m.role,
  m.content
FROM ai_session_messages m
JOIN ai_sessions s ON m.session_id = s.id
JOIN profiles p ON s.user_id = p.id
WHERE s.id = 'SESSION_ID_HERE'
ORDER BY m.created_at ASC;
```

## Troubleshooting

### No Sessions Appearing

1. **Check if tables exist**:
   ```sql
   SELECT table_name FROM information_schema.tables 
   WHERE table_name IN ('ai_sessions', 'ai_session_messages');
   ```
   
2. **If tables don't exist**, run the setup SQL from `SUPABASE_SETUP.md` section "AI Sessions Table Setup"

3. **Check browser console** for error messages

### Sessions Created but No Messages

1. **Verify message table exists**:
   ```sql
   SELECT COUNT(*) FROM ai_session_messages;
   ```

2. **Check for authentication issues** in browser console

3. **Ensure Supabase client is initialized** before starting conversation

### Incomplete Sessions (no end time)

This happens when:
- User closes browser tab mid-conversation
- App crashes
- Network disconnects

These can be identified with:
```sql
SELECT id, user_id, started_at 
FROM ai_sessions 
WHERE ended_at IS NULL
ORDER BY started_at DESC;
```

## Current Status

**Database Tables**: ✅ Created in Replit PostgreSQL
- `ai_sessions` (4 columns)
- `ai_session_messages` (5 columns)

**Backend API**: ✅ Ready
- POST `/api/ai-sessions/start`
- POST `/api/ai-sessions/end/:id`
- POST `/api/ai-sessions/:id/messages`

**Frontend**: ✅ Integrated
- Initializes Supabase for authentication
- Creates session before starting conversation
- Saves messages in real-time
- Ends session when conversation stops

**Testing Required**: ⚠️ User needs to test
- Have an actual AI conversation
- Verify data appears in Replit PostgreSQL
- Confirm all messages are recorded
