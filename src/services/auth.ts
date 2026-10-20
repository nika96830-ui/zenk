import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

export async function signUp(email: string, password: string, fullName?: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName || '' },
      emailRedirectTo: window.location.origin,
    },
  });
  if (error) throw error;
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('zenk-meetings-cache:')) localStorage.removeItem(key);
    }
  } catch {
    // Storage may be unavailable in a restricted browser context.
  }
}

export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getCurrentUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
}

export function onAuthStateChange(callback: (event: string, session: Session | null) => void) {
  const { data } = supabase.auth.onAuthStateChange(callback);
  return data.subscription;
}

export async function savePushToken(token: string) {
  const user = await getCurrentUser();
  if (!user) return;
  await supabase.from('profiles').upsert({ id: user.id, push_token: token, updated_at: new Date().toISOString() });
}
