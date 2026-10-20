import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleProcessMeeting } from './handler.ts';

serve((req) => handleProcessMeeting(req, {
  // Never use service-role privileges for user-selected audio or meeting rows.
  clientFor: (authorization) => createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  ),
  openAiKey: () => Deno.env.get('OPENAI_API_KEY'),
  // The service-role client is created only inside this quota RPC callback.
  // It never reads or writes meetings, tasks, profiles, or Storage objects.
  reserveUsage: async (userId, meetingId, plan, periodStart) => {
    const quotas: Record<string, number> = { free: 5, freelance: 100, team: 500 };
    const quota = quotas[plan] ?? quotas.free;
    const trustedClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await trustedClient.rpc('reserve_meeting_usage', {
      p_user_id: userId,
      p_meeting_id: meetingId,
      p_period_start: periodStart,
      p_quota: quota,
    });
    if (error) throw new Error('Usage reservation failed');
    return data === true;
  },
  fetch: globalThis.fetch,
}));
