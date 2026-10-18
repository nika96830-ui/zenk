import { useState, useEffect, useCallback } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { getSession, onAuthStateChange, signIn, signUp, signOut } from '../services/auth';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSession().then((s) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });
    const subscription = onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });
    return () => { subscription.unsubscribe(); };
  }, []);

  const login = useCallback(async (email: string, password: string) => signIn(email, password), []);
  const register = useCallback(async (email: string, password: string, fullName?: string) => signUp(email, password, fullName), []);
  const logout = useCallback(async () => { await signOut(); }, []);

  return { user, session, loading, isAuthenticated: !!user, login, register, logout };
}
