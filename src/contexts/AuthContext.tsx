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
    setLoading(true);

    try {
      const [profileRes, roleRes] = await Promise.all([
        supabase.from('profiles').select('full_name, email, avatar_url').eq('id', userId).maybeSingle(),
        supabase.rpc('get_user_role', { _user_id: userId }),
      ]);

      const resolvedRole = (roleRes.data as AppRole | null) ?? null;

      console.log(`User role detected: ${resolvedRole}, redirecting based on role`);

      setProfile(profileRes.data ?? null);
      setRole(resolvedRole);

      return resolvedRole;
    } catch (err) {
      console.error('Failed to fetch profile/role:', err);
      setRole(null);
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (nextSession?.user) {
        setRole(undefined);
        setLoading(true);
      } else {
        setProfile(null);
        setRole(null);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setRole(undefined);
        setLoading(true);
      } else {
        setProfile(null);
        setRole(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    fetchProfileAndRole(user.id);
  }, [user]);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.user) {
      return { error, role: null };
    }

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
