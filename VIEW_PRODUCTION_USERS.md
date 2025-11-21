# 📊 How to View Production Users & AI Usage

## Quick Access Commands

### 1️⃣ **View ALL Users in Database**
```sql
-- This shows EVERY user who has logged in
SELECT 
  id,
  display_name,
  email,
  created_at
FROM profiles
ORDER BY created_at DESC;
```

### 2️⃣ **View Users with AI Usage Stats**
```sql
-- Complete user list with AI conversation metrics
SELECT 
  p.display_name as name,
  p.email,
  p.created_at as joined,
  COUNT(DISTINCT s.id) as ai_sessions,
  COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM (s.ended_at - s.started_at))) / 60.0, 2), 0) as total_minutes,
  MAX(s.started_at) as last_activity
FROM profiles p
LEFT JOIN ai_sessions s ON p.id = s.user_id
GROUP BY p.id, p.display_name, p.email, p.created_at
ORDER BY p.created_at DESC;
```

### 3️⃣ **Today's Active Users**
```sql
-- Who used the AI today?
SELECT 
  p.display_name,
  p.email,
  COUNT(s.id) as sessions_today,
  MIN(s.started_at) as first_session,
  MAX(s.started_at) as last_session
FROM profiles p
JOIN ai_sessions s ON p.id = s.user_id
WHERE DATE(s.started_at) = CURRENT_DATE
GROUP BY p.id, p.display_name, p.email;
```

## 🔧 How the System Works

### Profile Creation Flow:
1. **New Sign Up** → Profile created immediately with name + email
2. **Existing User Sign In** → Profile created if missing (auto-sync)
3. **Google OAuth** → Profile created on first authentication
4. **Any Auth Method** → `/api/profile/ensure` endpoint guarantees profile exists

### What Gets Tracked:
- **User Info**: Name, email, join date
- **AI Sessions**: Start time, end time, duration
- **Messages**: Full conversation transcript with timestamps
- **Activity**: Which users are active, when they use the app

## 🚀 Production Deployment Notes

### Why You Might Not See Users:
1. **Users on production site** → Data is in production database
2. **Testing locally** → Data is in development database
3. **Different databases** → Production and dev are separate

### To See Production Users:
1. **Deploy your app** to production
2. **Access production database** through Replit Database UI
3. **Run the queries above** in production environment

## 📝 Files Created for Tracking

1. **`ADMIN_USER_TRACKING.md`** - Complete admin queries
2. **`AI_SESSIONS_REPORT.md`** - AI session specific queries
3. **`VIEW_PRODUCTION_USERS.md`** - This file (quick reference)

## ✅ What's Fixed

### Before:
- ❌ Users could sign in without profiles being created
- ❌ No email tracking in profiles table
- ❌ AI sessions couldn't link to user info
- ❌ No way to see who's using the app

### After:
- ✅ All authenticated users get profiles automatically
- ✅ Email + name stored for every user
- ✅ AI sessions track WHO, WHEN, HOW LONG, and WHAT
- ✅ Complete admin dashboard queries available
- ✅ Production-ready user tracking system

## 🎯 Test the System

1. **Sign Out** and create a new account
2. **Use AI Chat** for a few messages
3. **Run this query** to see yourself:
```sql
SELECT 
  p.display_name,
  p.email,
  s.started_at,
  s.ended_at,
  COUNT(m.id) as messages
FROM profiles p
JOIN ai_sessions s ON p.id = s.user_id
LEFT JOIN ai_session_messages m ON s.id = m.session_id
WHERE p.email = 'your-email@example.com'
GROUP BY p.id, p.display_name, p.email, s.id;
```

## 🔍 Debug Commands

### Check Profile Creation:
```sql
-- See newest profiles first
SELECT * FROM profiles ORDER BY created_at DESC LIMIT 10;
```

### Check AI Session Tracking:
```sql
-- See recent AI sessions
SELECT 
  s.*,
  p.email
FROM ai_sessions s
JOIN profiles p ON s.user_id = p.id
ORDER BY s.started_at DESC
LIMIT 10;
```

### Check for Missing Profiles:
```sql
-- Should return 0 rows (no orphaned sessions)
SELECT COUNT(*) as orphaned_sessions
FROM ai_sessions s
LEFT JOIN profiles p ON s.user_id = p.id
WHERE p.id IS NULL;
```