import { useState, useEffect, useCallback } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { getSession, onAuthStateChange, signIn, signUp, signOut } from '../services/auth';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let receivedAuthEvent = false;

    const subscription = onAuthStateChange((_event, nextSession) => {
      receivedAuthEvent = true;
      if (!active) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    getSession()
      .then((initialSession) => {
        if (!active || receivedAuthEvent) return;
        setSession(initialSession);
        setUser(initialSession?.user ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (!active || receivedAuthEvent) return;
        setSession(null);
        setUser(null);
        setLoading(false);
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => signIn(email, password), []);
  const register = useCallback(async (email: string, password: string, fullName?: string) => signUp(email, password, fullName), []);
  const logout = useCallback(async () => { await signOut(); }, []);

  return { user, session, loading, isAuthenticated: !!session && !!user, login, register, logout };
}
