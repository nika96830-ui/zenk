import { useState, useEffect, useCallback } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { getSession, onAuthStateChange, signIn, signUp, signOut } from '../services/auth';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const subscription = onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setSessionError(null);
      setLoading(false);
    });

    getSession()
      .then((nextSession) => {
        if (!active) return;
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        setSessionError(null);
      })
      .catch(() => {
        if (!active) return;
        setSession(null);
        setUser(null);
        setSessionError('SESSION_RESTORE_FAILED');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => signIn(email, password), []);
  const register = useCallback(async (email: string, password: string, fullName?: string) => signUp(email, password, fullName), []);
  const logout = useCallback(async () => {
    await signOut();
    setSession(null);
    setUser(null);
  }, []);

  return { user, session, loading, sessionError, isAuthenticated: !!user, login, register, logout };
}
