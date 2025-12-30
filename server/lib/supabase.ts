import { createClient } from '@supabase/supabase-js';

// Fallback defaults for local dev if env vars are missing
const DEFAULT_SUPABASE_URL = 'https://mytdwuuzzbmxftpwofsa.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15dGR3dXV6emJteGZ0cHdvZnNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxMTgyOTQsImV4cCI6MjA3NTY5NDI5NH0.Qhz2gXC1Ic_-mJsYtKv5H35r0oLW1JbBKwlWvdUi6eM';
const DEFAULT_SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15dGR3dXV6emJteGZ0cHdvZnNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDExODI5NCwiZXhwIjoyMDc1Njk0Mjk0fQ.xZkVLXv5ageH_90kHVBmPcvthSE9xk9i3vcuqx3fOvQ';

let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
let supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || DEFAULT_SUPABASE_SERVICE_KEY;

// Auto-detect and fix swapped URL and anon key
if (supabaseUrl.startsWith('eyJ') && supabaseAnonKey.startsWith('http')) {
  [supabaseUrl, supabaseAnonKey] = [supabaseAnonKey, supabaseUrl];
}

// Validate Supabase configuration
if (!supabaseUrl || !supabaseUrl.startsWith('http')) {
  console.error('❌ Invalid NEXT_PUBLIC_SUPABASE_URL. It should start with https://');
  console.error('   Current value starts with:', supabaseUrl.substring(0, 20));
  console.error('\n📝 Please check your Replit Secrets and ensure:');
  console.error('   NEXT_PUBLIC_SUPABASE_URL = Your project URL (e.g., https://xxxxx.supabase.co)');
  console.error('   NEXT_PUBLIC_SUPABASE_ANON_KEY = Your anon/public key (starts with eyJ...)');
  console.error('   SUPABASE_SERVICE_ROLE_KEY = Your service role key (starts with eyJ...)');
  // In dev, continue with defaults to avoid exit
  if (process.env.NODE_ENV !== 'production') {
    console.warn('⚠️  Using fallback Supabase URL for development');
  } else {
    process.exit(1);
  }
}

if (!supabaseAnonKey || !supabaseServiceKey) {
  console.error('❌ Missing Supabase keys. Please set all required secrets.');
  if (process.env.NODE_ENV !== 'production') {
    console.warn('⚠️  Using fallback Supabase keys for development');
  } else {
    process.exit(1);
  }
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export const getSupabaseClient = (accessToken?: string) => {
  if (accessToken) {
    return createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });
  }
  return createClient(supabaseUrl, supabaseAnonKey);
};
