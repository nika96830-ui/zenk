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
  fetch: globalThis.fetch,
}));
