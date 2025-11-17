# AI Sessions Report - User Activity Tracking

This document contains SQL queries to view AI conversation sessions with user information (name, email, and exact time of use).

## 📊 View All AI Sessions with User Info

```sql
-- See all AI sessions with user name, email, and duration
SELECT 
  s.id as session_id,
  p.display_name as user_name,
  p.email as user_email,
  s.started_at,
  s.ended_at,
  CASE 
    WHEN s.ended_at IS NOT NULL 
    THEN EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) 
    ELSE NULL 
  END as duration_seconds,
  CASE 
    WHEN s.ended_at IS NOT NULL 
    THEN ROUND(EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) / 60.0, 2)
    ELSE NULL 
  END as duration_minutes
FROM ai_sessions s
JOIN profiles p ON s.user_id = p.id
ORDER BY s.started_at DESC;
```

## 📝 View Sessions with Message Count

```sql
-- See AI sessions with message count per session
SELECT 
  s.id as session_id,
  p.display_name as user_name,
  p.email as user_email,
  s.started_at,
  s.ended_at,
  EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) as duration_seconds,
  COUNT(m.id) as message_count
FROM ai_sessions s
JOIN profiles p ON s.user_id = p.id
LEFT JOIN ai_session_messages m ON s.id = m.session_id
GROUP BY s.id, p.display_name, p.email, s.started_at, s.ended_at
ORDER BY s.started_at DESC;
```

## 💬 View Full Conversation Transcript for a Session

```sql
-- Replace 'SESSION_ID_HERE' with the actual session ID
SELECT 
  p.display_name as user_name,
  p.email as user_email,
  s.started_at as session_start,
  s.ended_at as session_end,
  m.created_at as message_time,
  m.role,
  m.content
FROM ai_sessions s
JOIN profiles p ON s.user_id = p.id
JOIN ai_session_messages m ON s.id = m.session_id
WHERE s.id = 'SESSION_ID_HERE'
ORDER BY m.created_at ASC;
```

## 📈 User Activity Summary

```sql
-- See total AI usage per user
SELECT 
  p.display_name as user_name,
  p.email as user_email,
  COUNT(s.id) as total_sessions,
  SUM(EXTRACT(EPOCH FROM (s.ended_at - s.started_at))) as total_seconds,
  ROUND(SUM(EXTRACT(EPOCH FROM (s.ended_at - s.started_at))) / 60.0, 2) as total_minutes,
  MIN(s.started_at) as first_session,
  MAX(s.started_at) as last_session
FROM profiles p
LEFT JOIN ai_sessions s ON p.id = s.user_id
WHERE s.ended_at IS NOT NULL
GROUP BY p.id, p.display_name, p.email
ORDER BY total_seconds DESC NULLS LAST;
```

## 🕐 Sessions by Date

```sql
-- AI sessions grouped by date
SELECT 
  DATE(s.started_at) as session_date,
  COUNT(DISTINCT s.id) as total_sessions,
  COUNT(DISTINCT s.user_id) as unique_users,
  ROUND(SUM(EXTRACT(EPOCH FROM (s.ended_at - s.started_at))) / 60.0, 2) as total_minutes
FROM ai_sessions s
WHERE s.ended_at IS NOT NULL
GROUP BY DATE(s.started_at)
ORDER BY session_date DESC;
```

## 🔍 Recent Sessions (Last 24 Hours)

```sql
-- Sessions from the last 24 hours
SELECT 
  s.id as session_id,
  p.display_name as user_name,
  p.email as user_email,
  s.started_at,
  s.ended_at,
  EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) as duration_seconds,
  COUNT(m.id) as messages_exchanged
FROM ai_sessions s
JOIN profiles p ON s.user_id = p.id
LEFT JOIN ai_session_messages m ON s.id = m.session_id
WHERE s.started_at >= NOW() - INTERVAL '24 hours'
GROUP BY s.id, p.display_name, p.email, s.started_at, s.ended_at
ORDER BY s.started_at DESC;
```

## 🎯 Active vs Completed Sessions

```sql
-- See which sessions are still active (no end time)
SELECT 
  CASE 
    WHEN s.ended_at IS NULL THEN 'Active'
    ELSE 'Completed'
  END as status,
  COUNT(*) as session_count
FROM ai_sessions s
GROUP BY CASE WHEN s.ended_at IS NULL THEN 'Active' ELSE 'Completed' END;
```

## How to Use

1. **View in Replit Database**: Click the Database icon in the left sidebar
2. **Run SQL Queries**: Copy any query above and paste it into the SQL query editor
3. **Export Data**: Click "Export" to download results as CSV

## Database Schema

### Tables Used:
- **`ai_sessions`**: Stores session start/end times and user ID
- **`ai_session_messages`**: Stores conversation transcripts (role, content, timestamp)
- **`profiles`**: Stores user information (name, email)

### Key Fields:
- `display_name`: User's full name
- `email`: User's email address
- `started_at`: Exact time conversation started
- `ended_at`: Exact time conversation ended
- `role`: "user" or "assistant"
- `content`: Message text
