import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigins = new Set(
  (Deno.env.get('ALLOWED_ORIGIN') || 'https://zenk-zangui.vercel.app')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);
function corsHeaders(origin: string | null) {
  return {
    ...(origin && allowedOrigins.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  };
}
function json(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } });
}
const cell = (value: unknown) => {
  const raw = String(value ?? '');
  const safe = /^[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
};
serve(async (req) => {
  const origin = req.headers.get('Origin');
  if (origin && !allowedOrigins.has(origin)) return new Response('Origin not allowed', { status: 403 });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json({ success: false, message: 'Method not allowed' }, 405, origin);
  try {
    const authorization = req.headers.get('Authorization') || '';
    if (!/^Bearer\s+\S+$/i.test(authorization)) return json({ success: false, message: 'Unauthorized' }, 401, origin);
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ success: false, message: 'Unauthorized' }, 401, origin);
    const body = await req.json();
    if (typeof body?.meetingId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.meetingId)) {
      return json({ success: false, message: 'Invalid meeting' }, 400, origin);
    }
    const format = body.format === 'markdown' ? 'markdown' : body.format === 'csv' ? 'csv' : null;
    if (!format) return json({ success: false, message: 'Unsupported format' }, 400, origin);
    const { data: meeting, error: meetingError } = await userClient.from('meetings').select('id, title').eq('id', body.meetingId).eq('user_id', user.id).single();
    if (meetingError || !meeting) return json({ success: false, message: 'Meeting not found' }, 404, origin);
    const { data: tasks, error: tasksError } = await userClient.from('tasks').select('title, assignee, due_date, completed')
      .eq('meeting_id', meeting.id).eq('user_id', user.id).order('created_at', { ascending: true });
    if (tasksError) return json({ success: false, message: 'Could not load tasks' }, 500, origin);
    if (!tasks?.length) return json({ success: false, message: 'No tasks' }, 400, origin);
    const content = format === 'csv'
      ? ['Task,Assignee,Deadline,Done', ...tasks.map((t) => [t.title, t.assignee, t.due_date, t.completed ? 'yes' : 'no'].map(cell).join(','))].join('\r\n')
      : `# ${meeting.title || 'Meeting'}\n\n${tasks.map((t) => `- [${t.completed ? 'x' : ' '}] ${t.title || ''}${t.assignee ? ` (@${t.assignee})` : ''}${t.due_date ? ` — ${t.due_date}` : ''}`).join('\n')}`;
    return json({ success: true, content, format }, 200, origin);
  } catch {
    return json({ success: false, message: 'Export failed' }, 500, origin);
  }
});
