import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { getSupabase } from '@/lib/supabase';
import type { User, Session, SupabaseClient } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const supabaseRef = useRef<SupabaseClient | null>(null);

  useEffect(() => {
    let mounted = true;
    let subscription: any = null;

    const checkAuth = async () => {
      try {
        // Get singleton client
        const client = await getSupabase();
        supabaseRef.current = client;
        
        if (mounted) {
          const { data: { session } } = await client.auth.getSession();
          setSession(session);
          setUser(session?.user ?? null);
          
          // Ensure profile exists for any authenticated user
          if (session?.user) {
            try {
              const profileResponse = await fetch('/api/profile/ensure', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                  userId: session.user.id,
                  email: session.user.email,
                  name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0],
                }),
              });
              
              if (!profileResponse.ok) {
                console.error('Failed to ensure profile exists');
              }
            } catch (error) {
              console.error('Error ensuring profile:', error);
            }
          }
          
          setLoading(false);
          
          // Set up auth state listener
          const { data: { subscription: sub } } = client.auth.onAuthStateChange(
            (event: any, session: any) => {
              if (mounted) {
                setSession(session);
                setUser(session?.user ?? null);
                
                // Handle password recovery flow
                if (event === 'PASSWORD_RECOVERY') {
                  // Session will be available for password update
                }
              }
            }
          );
          subscription = sub;
        }
      } catch (error: any) {
        // Ignore refresh_token_not_found errors during password recovery flow
        // These are expected when Supabase is processing a recovery token
        if (!error?.message?.includes('refresh_token_not_found')) {
          console.error('Auth check error:', error);
        }
        if (mounted) {
          setLoading(false);
        }
      }
    };

    checkAuth();

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    // Call backend signin endpoint which ensures profile exists
    const response = await fetch('/api/auth/signin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
    
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to sign in');
    }
    
    const result = await response.json();
    
    // Hydrate the Supabase client with the session from backend
    // This ensures getAuthHeaders() can access the session
    if (result.session) {
      const client = supabaseRef.current || await getSupabase();
      await client.auth.setSession({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token,
      });
      
      // Update state
      setSession(result.session);
      setUser(result.user);
    }
  };

  const signUp = async (email: string, password: string, name?: string) => {
    // Call backend signup endpoint which creates user AND profile
    const response = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password, name }),
    });
    
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to sign up');
    }
    
    // Now sign in to get the session
    const client = supabaseRef.current || await getSupabase();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    
    // Update state
    if (data.session) {
      setSession(data.session);
      setUser(data.session.user);
    }
  };

  const signOut = async () => {
    try {
      const client = supabaseRef.current || await getSupabase();
      await client.auth.signOut();
    } catch (error) {
      // Ignore session errors during signout - still clear local state
    } finally {
      // Always clear local state
      setSession(null);
      setUser(null);
      // Clear password reset flow flags if user abandons password reset
      localStorage.removeItem('password_reset_flow');
      localStorage.removeItem('password_reset_detected_at');
      localStorage.removeItem('password_reset_hash');
    }
  };

  const resetPassword = async (email: string) => {
    const client = supabaseRef.current || await getSupabase();
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth`,
    });
    if (error) throw error;
  };

  const updatePassword = async (newPassword: string) => {
    const client = supabaseRef.current || await getSupabase();
    const { error } = await client.auth.updateUser({ password: newPassword });
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut, resetPassword, updatePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
