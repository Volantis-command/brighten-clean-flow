import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type AppRole = 'admin' | 'head_cleaner' | 'cleaner' | 'client';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: { full_name: string; email: string; avatar_url: string | null } | null;
  role: AppRole | null | undefined;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any; role: AppRole | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthContextType['profile']>(null);
  const [role, setRole] = useState<AppRole | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  const fetchProfileAndRole = async (userId: string) => {
    try {
      const timeoutMs = 5000;
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), timeoutMs);

      const [profileRes, roleRes] = await Promise.all([
        supabase.from('profiles').select('full_name, email, avatar_url').eq('id', userId).maybeSingle(),
        supabase.rpc('get_user_role', { _user_id: userId }),
      ]);

      window.clearTimeout(timer);

      const resolvedRole = (roleRes.data as AppRole | null) ?? null;
      setProfile(profileRes.data ?? null);
      setRole(resolvedRole);
      return resolvedRole;
    } catch (err) {
      console.error('Failed to fetch profile/role:', err);
      setProfile(null);
      setRole(null);
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 1. Set up listener FIRST (before getSession)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (nextSession?.user) {
        // role will be fetched by the user effect below
        setRole(undefined);
      } else {
        setProfile(null);
        setRole(null);
        setLoading(false);
      }
    });

    // 2. Bootstrap: race getSession against a 3-second timeout
    const bootstrap = async () => {
      try {
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<{ data: { session: null } }>((resolve) =>
          window.setTimeout(() => resolve({ data: { session: null } }), 3000)
        );

        const { data: { session: s } } = await Promise.race([sessionPromise, timeoutPromise]);

        setSession(s);
        setUser(s?.user ?? null);

        if (!s?.user) {
          // No session — immediately mark as not loading so /login renders
          setProfile(null);
          setRole(null);
          setLoading(false);
        }
        // If there IS a user, the useEffect[user] below will fetch profile/role
      } catch (err) {
        console.error('Auth bootstrap failed:', err);
        setSession(null);
        setUser(null);
        setProfile(null);
        setRole(null);
        setLoading(false);
      }
    };

    bootstrap();

    return () => subscription.unsubscribe();
  }, []);

  // Fetch profile & role whenever user changes
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetchProfileAndRole(user.id);
  }, [user]);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.user) {
      return { error, role: null };
    }

    setLoading(true);
    const resolvedRole = await fetchProfileAndRole(data.user.id);
    return { error: null, role: resolvedRole };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, role, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
