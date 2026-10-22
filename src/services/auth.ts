import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

export async function signUp(email: string, password: string, fullName?: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName || '' } },
  });
  if (error) throw new Error(authErrorCode(error.message));
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(authErrorCode(error.message));
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(authErrorCode(error.message));
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('zang-meetings-cache:') || key.startsWith('zenk-meetings-cache:')) localStorage.removeItem(key);
    }
  } catch {
    // Storage may be unavailable; auth sign-out must still complete.
  }
}

export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw new Error(authErrorCode(error.message));
}

export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(authErrorCode(error.message));
}

export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error('SESSION_RESTORE_FAILED');
  return data.session;
}

export async function getCurrentUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(authErrorCode(error.message));
  return data.user;
}

export function onAuthStateChange(callback: (event: string, session: Session | null) => void) {
  const { data } = supabase.auth.onAuthStateChange(callback);
  return data.subscription;
}

export async function savePushToken(token: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('AUTH_REQUIRED');
  const { error } = await supabase.from('profiles').upsert({
    id: user.id,
    push_token: token,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error('PROFILE_UPDATE_FAILED');
}

function authErrorCode(message: string): string {
  const value = message.toLowerCase();
  if (value.includes('invalid login') || value.includes('invalid credentials')) return 'AUTH_INVALID_CREDENTIALS';
  if (value.includes('already registered') || value.includes('already exists')) return 'AUTH_EMAIL_EXISTS';
  if (value.includes('email not confirmed')) return 'AUTH_EMAIL_NOT_CONFIRMED';
  if (value.includes('password') && (value.includes('length') || value.includes('characters'))) return 'AUTH_PASSWORD_TOO_SHORT';
  if (value.includes('network') || value.includes('fetch')) return 'AUTH_NETWORK_ERROR';
  if (value.includes('rate limit') || value.includes('too many requests')) return 'AUTH_RATE_LIMIT';
  return 'AUTH_GENERIC_ERROR';
}
