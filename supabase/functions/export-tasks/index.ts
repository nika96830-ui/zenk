import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Hosted Supabase supplies modern key maps; prefer them when legacy keys are disabled.
// An invalid configured map fails closed instead of silently using a legacy key.
function runtimeKey(mapName: string, legacyName: string): string | undefined {
  const raw = Deno.env.get(mapName);
  if (raw) {
    try {
      const keys = JSON.parse(raw);
      if (!keys || typeof keys !== 'object' || Array.isArray(keys)) return undefined;
      if (Object.prototype.hasOwnProperty.call(keys, 'default')) {
        return typeof keys.default === 'string' && keys.default ? keys.default : undefined;
      }
      // A project may name its only key instead of calling it "default".
      // Do not guess between multiple named keys or downgrade to disabled legacy keys.
      const values = Object.values(keys);
      return values.length === 1 && typeof values[0] === 'string' && values[0] ? values[0] : undefined;
    } catch { return undefined; }
  }
  return Deno.env.get(legacyName);
}

// Keep the configured production origin while allowing this exact reviewed PR preview.
const PR_PREVIEW_ORIGIN = 'https://zenk-git-fix-zenk-consolidated-security-zangui.vercel.app';
const MAX_TASKS = 5000;
const MAX_EXPORT_BYTES = 1_000_000;

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function csvCell(input: unknown): string {
  const value = String(input ?? '');
  // Excel/LibreOffice can evaluate cells whose first non-whitespace character is a formula marker.
  const protectedValue = /^[\u0000-\u0020]*[=+\-@]/.test(value) ? "'" + value : value;
  return '"' + protectedValue.replace(/"/g, '""') + '"';
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
}

serve(async (req) => {
  let cors: Record<string, string> = {};
  try {
    // CORS is a browser boundary, not authorization: every request still requires a verified
    // Supabase user and owner-scoped RLS queries. ALLOWED_ORIGIN is optional so the documented
    // deployment setup does not silently disable exports when that extra secret is absent.
    const configuredOrigin = Deno.env.get('ALLOWED_ORIGIN');
    const requestOrigin = req.headers.get('Origin');
    const origin = configuredOrigin ? new URL(configuredOrigin).origin : '*';
    cors = corsHeaders(requestOrigin === PR_PREVIEW_ORIGIN ? PR_PREVIEW_ORIGIN : origin);
    if (configuredOrigin && requestOrigin && requestOrigin !== origin && requestOrigin !== PR_PREVIEW_ORIGIN) {
      return json({ success: false, message: 'ORIGIN_NOT_ALLOWED' }, 403, cors);
    }
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ success: false, message: 'METHOD_NOT_ALLOWED' }, 405, cors);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ success: false, message: 'UNAUTHORIZED' }, 401, cors);
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = runtimeKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');
    if (!supabaseUrl || !anonKey) return json({ success: false, message: 'SERVER_CONFIGURATION_ERROR' }, 500, cors);

    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return json({ success: false, message: 'UNAUTHORIZED' }, 401, cors);

    const body = await req.json();
    if (typeof body.meetingId !== 'string' || !body.meetingId || body.meetingId.length > 128) {
      return json({ success: false, message: 'MEETING_REQUIRED' }, 400, cors);
    }
    const format = body.format === 'markdown' || body.format === 'csv' ? body.format : null;
    if (!format) return json({ success: false, message: 'INVALID_FORMAT' }, 400, cors);

    const { data: meeting, error: meetingError } = await client
      .from('meetings').select('id,title').eq('id', body.meetingId).eq('user_id', user.id).maybeSingle();
    if (meetingError) throw meetingError;
    if (!meeting) return json({ success: false, message: 'MEETING_NOT_FOUND' }, 404, cors);

    const { data: tasks, error: tasksError } = await client
      .from('tasks').select('title,assignee,due_date,completed')
      .eq('meeting_id', meeting.id).eq('user_id', user.id).order('created_at', { ascending: true }).limit(MAX_TASKS);
    if (tasksError) throw tasksError;
    if (!tasks?.length) return json({ success: false, message: 'NO_TASKS' }, 400, cors);

    const content = format === 'csv'
      ? ['Task,Assignee,Deadline,Done', ...tasks.map((task) => [
          csvCell(task.title), csvCell(task.assignee), csvCell(task.due_date), csvCell(task.completed ? 'yes' : 'no'),
        ].join(','))].join('\r\n')
      : `# ${String(meeting.title || 'Meeting').replace(/[\r\n]/g, ' ')}\n\n` +
        tasks.map((task) => `- [${task.completed ? 'x' : ' '}] ${String(task.title || '').replace(/[\r\n]/g, ' ')}${task.assignee ? ` (@${String(task.assignee).replace(/[\r\n]/g, ' ')})` : ''}${task.due_date ? ` — ${task.due_date}` : ''}`).join('\n');

    if (new TextEncoder().encode(content).byteLength > MAX_EXPORT_BYTES) {
      return json({ success: false, message: 'EXPORT_TOO_LARGE' }, 413, cors);
    }
    return json({ success: true, content, format }, 200, cors);
  } catch (error) {
    console.error('export-tasks failed', error instanceof Error ? error.message : 'unknown');
    return json({ success: false, message: 'EXPORT_FAILED' }, 500, cors);
  }
});
