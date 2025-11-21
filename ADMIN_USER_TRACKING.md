# Admin User Tracking Dashboard

## 🎯 Main Dashboard Query - ALL Users & AI Usage

```sql
-- View ALL users and their AI conversation usage
SELECT 
  p.id as user_id,
  p.display_name as name,
  p.email,
  p.created_at as joined_date,
  COUNT(DISTINCT s.id) as total_ai_sessions,
  COUNT(DISTINCT CASE WHEN s.ended_at IS NOT NULL THEN s.id END) as completed_sessions,
  COUNT(DISTINCT CASE WHEN s.ended_at IS NULL THEN s.id END) as active_sessions,
  COALESCE(ROUND(SUM(CASE WHEN s.ended_at IS NOT NULL 
      THEN EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) 
      ELSE 0 END) / 60.0, 2), 0) as total_minutes_used,
  MIN(s.started_at) as first_ai_session,
  MAX(s.started_at) as last_ai_session,
  COUNT(m.id) as total_messages_sent
FROM profiles p
LEFT JOIN ai_sessions s ON p.id = s.user_id
LEFT JOIN ai_session_messages m ON s.id = m.session_id
GROUP BY p.id, p.display_name, p.email, p.created_at
ORDER BY p.created_at DESC;
```

## 📊 Quick Stats - User Counts

```sql
-- Quick stats: Total users, active users, new users today
SELECT 
  COUNT(DISTINCT p.id) as total_users,
  COUNT(DISTINCT s.user_id) as users_who_used_ai,
  COUNT(DISTINCT CASE WHEN DATE(p.created_at) = CURRENT_DATE THEN p.id END) as new_users_today,
  COUNT(DISTINCT CASE WHEN DATE(s.started_at) = CURRENT_DATE THEN s.user_id END) as active_ai_users_today
FROM profiles p
LEFT JOIN ai_sessions s ON p.id = s.user_id;
```

## 👥 List All Users (Even Those Without AI Usage)

```sql
-- See ALL registered users
SELECT 
  id,
  display_name as name,
  email,
  created_at as joined_date,
  locale
FROM profiles
ORDER BY created_at DESC;
```

## 🔍 Find Specific User

```sql
-- Search for user by email or name
SELECT 
  p.*,
  COUNT(s.id) as ai_sessions,
  MAX(s.started_at) as last_ai_session
FROM profiles p
LEFT JOIN ai_sessions s ON p.id = s.user_id
WHERE p.email LIKE '%@example.com%' 
   OR p.display_name ILIKE '%john%'
GROUP BY p.id;
```

## 📈 User Activity Timeline (Last 7 Days)

```sql
-- Daily user activity for the past week
SELECT 
  DATE(p.created_at) as date,
  COUNT(DISTINCT p.id) as new_signups,
  COUNT(DISTINCT s.user_id) as active_ai_users,
  COUNT(s.id) as total_ai_sessions,
  ROUND(SUM(EXTRACT(EPOCH FROM (s.ended_at - s.started_at))) / 60.0, 2) as total_minutes
FROM profiles p
FULL OUTER JOIN ai_sessions s 
  ON DATE(p.created_at) = DATE(s.started_at)
WHERE DATE(p.created_at) >= CURRENT_DATE - INTERVAL '7 days'
   OR DATE(s.started_at) >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(p.created_at)
ORDER BY date DESC;
```

## 💬 View User's Full AI Conversation History

```sql
-- Replace 'USER_ID_HERE' with actual user ID
SELECT 
  s.id as session_id,
  s.started_at,
  s.ended_at,
  EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) as duration_seconds,
  m.created_at as message_time,
  m.role,
  m.content
FROM ai_sessions s
JOIN ai_session_messages m ON s.id = m.session_id
WHERE s.user_id = 'USER_ID_HERE'
ORDER BY s.started_at DESC, m.created_at ASC;
```

## 🏆 Top AI Users (Leaderboard)

```sql
-- Top 10 users by AI usage time
SELECT 
  p.display_name as name,
  p.email,
  COUNT(DISTINCT s.id) as sessions,
  ROUND(SUM(EXTRACT(EPOCH FROM (s.ended_at - s.started_at))) / 60.0, 2) as total_minutes,
  COUNT(m.id) as messages_exchanged
FROM profiles p
JOIN ai_sessions s ON p.id = s.user_id
LEFT JOIN ai_session_messages m ON s.id = m.session_id
WHERE s.ended_at IS NOT NULL
GROUP BY p.id, p.display_name, p.email
ORDER BY total_minutes DESC
LIMIT 10;
```

## 🚨 Find Users Without Profiles (Debug)

```sql
-- Check for orphaned AI sessions (should be empty)
SELECT 
  s.user_id,
  COUNT(s.id) as sessions,
  MIN(s.started_at) as first_session
FROM ai_sessions s
LEFT JOIN profiles p ON s.user_id = p.id
WHERE p.id IS NULL
GROUP BY s.user_id;
```

## 📅 Monthly Usage Report

```sql
-- Monthly breakdown of user activity
SELECT 
  DATE_TRUNC('month', s.started_at) as month,
  COUNT(DISTINCT s.user_id) as unique_users,
  COUNT(s.id) as total_sessions,
  ROUND(AVG(EXTRACT(EPOCH FROM (s.ended_at - s.started_at))), 2) as avg_session_seconds,
  ROUND(SUM(EXTRACT(EPOCH FROM (s.ended_at - s.started_at))) / 60.0, 2) as total_minutes
FROM ai_sessions s
WHERE s.ended_at IS NOT NULL
GROUP BY DATE_TRUNC('month', s.started_at)
ORDER BY month DESC;
```

## 🔄 Real-Time Active Sessions

```sql
-- See who's currently using AI chat
SELECT 
  p.display_name as name,
  p.email,
  s.id as session_id,
  s.started_at,
  NOW() - s.started_at as duration_so_far,
  COUNT(m.id) as messages_so_far
FROM ai_sessions s
JOIN profiles p ON s.user_id = p.id
LEFT JOIN ai_session_messages m ON s.id = m.session_id
WHERE s.ended_at IS NULL
GROUP BY p.display_name, p.email, s.id, s.started_at
ORDER BY s.started_at DESC;
```

## 📊 Export All User Data (CSV)

```sql
-- Complete user export with all metrics
SELECT 
  p.id,
  p.display_name,
  p.email,
  p.locale,
  p.created_at,
  COUNT(DISTINCT s.id) as ai_sessions,
  COALESCE(SUM(EXTRACT(EPOCH FROM (s.ended_at - s.started_at))), 0) as total_seconds,
  COUNT(DISTINCT ac.id) as activities_completed,
  MAX(s.started_at) as last_ai_session,
  MAX(ac.completed_at) as last_activity
FROM profiles p
LEFT JOIN ai_sessions s ON p.id = s.user_id
LEFT JOIN activity_completions ac ON p.id = ac.user_id
GROUP BY p.id, p.display_name, p.email, p.locale, p.created_at
ORDER BY p.created_at DESC;
```

## How to Use These Queries

1. **View in Replit Database**: 
   - Click the Database icon in the sidebar
   - Copy any query above
   - Paste into the SQL editor
   - Click "Run"

2. **Export Data**:
   - After running a query
   - Click "Export" button
   - Choose CSV format
   - Download the file

3. **Schedule Reports**:
   - Use cron jobs with these queries
   - Send automated emails with user stats
   - Create dashboards with the data

## Important Notes

- **Profile Creation**: Profiles are automatically created when users sign up or sign in
- **Email Tracking**: User emails are now stored in the profiles table
- **Session Tracking**: Every AI conversation creates a session with start/end times
- **Message History**: Full conversation transcripts are saved in ai_session_messages

## Troubleshooting

If users are missing profiles:
1. They'll be created automatically on next login
2. The `/api/profile/ensure` endpoint creates profiles for existing users
3. Check the "Find Users Without Profiles" query above