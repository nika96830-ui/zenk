import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Dependencies = {
  clientFor: (authorization: string) => SupabaseClient;
  openAiKey: () => string | undefined;
  fetch: typeof fetch;
};

const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') || 'https://zenk-zangui.vercel.app';
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
  'X-Zang-Audio-Guard': 'owner-bound-rls',
};

function json(body: unknown, status = 200, diagnosticHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, ...diagnosticHeaders, 'Content-Type': 'application/json' },
  });
}

async function safeProviderCode(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  const allowed = [
    'insufficient_quota', 'rate_limit_exceeded', 'invalid_api_key',
    'model_not_found', 'unsupported_country_region_territory', 'invalid_request_error',
  ];
  return allowed.includes(body?.error?.code) ? body.error.code : 'provider_error';
}

export function isOwnedAudioPath(path: unknown, userId: string): path is string {
  if (typeof path !== 'string' || path.length > 1024) return false;
  const parts = path.split('/');
  return parts.length >= 2 && parts[0] === userId &&
    parts.every(part => part !== '.' && part !== '..' && /^[A-Za-z0-9_.-]+$/.test(part));
}

export async function handleProcessMeeting(req: Request, deps: Dependencies): Promise<Response> {
  const requestOrigin = req.headers.get('Origin');
  if (requestOrigin && requestOrigin !== allowedOrigin) return new Response('Origin not allowed', { status: 403 });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const authorization = req.headers.get('Authorization') || '';
  if (!/^Bearer\s+\S+$/i.test(authorization)) return json({ error: 'Unauthorized' }, 401);
  let stage = 'authentication';
  let providerStatus: number | undefined;
  let providerCode: string | undefined;

  try {
    // Validate the JWT server-side; never trust a client-supplied user ID.
    const client = deps.clientFor(authorization);
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid request' }, 400);
    }
    if (!body || typeof body.meetingId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.meetingId)) {
      return json({ error: 'Invalid request' }, 400);
    }
    const { meetingId, audioPath, language = 'ru' } = body;
    stage = 'meeting-authorization';
    const { data: meeting, error: meetingError } = await client.from('meetings')
      .select('id, user_id, audio_path, title')
      .eq('id', meetingId).eq('user_id', user.id).single();

    // Nonexistent and foreign meetings have the same response.
    if (meetingError || !meeting || meeting.user_id !== user.id) {
      return json({ error: 'Meeting not found' }, 404);
    }
    const path = meeting.audio_path;
    // The database row alone chooses the file. Legacy matching paths are accepted,
    // but a forged row, changed filename or encoded traversal is never processed.
    if (!isOwnedAudioPath(path, user.id) ||
        (audioPath !== undefined && audioPath !== path)) {
      return json({ error: 'Recording access denied' }, 403);
    }

    const openAiKey = deps.openAiKey();
    if (!openAiKey) return json({ error: 'Processing unavailable' }, 503);

    // Use the caller's JWT here too: Storage RLS remains a second access boundary.
    stage = 'audio-download';
    const { data: audio, error: downloadError } = await client.storage
      .from('recordings').download(path);
    if (downloadError || !audio) return json({ error: 'Recording unavailable' }, 404);

    stage = 'mark-processing';
    const { error: startError } = await client.from('meetings')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', meetingId).eq('user_id', user.id);
    if (startError) throw new Error('Save failed');

    const form = new FormData();
    form.append('file', new File([audio], path.split('/').at(-1)!, {
      type: audio.type || 'application/octet-stream',
    }));
    form.append('model', 'whisper-1');
    form.append('language', ['ru', 'en', 'tr', 'az'].includes(language) ? language : 'ru');
    stage = 'transcription';
    const whisperResponse = await deps.fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${openAiKey}` }, body: form,
    });
    providerStatus = whisperResponse.status;
    if (!whisperResponse.ok) {
      providerCode = await safeProviderCode(whisperResponse);
      throw new Error('Transcription failed');
    }
    const whisper = await whisperResponse.json();
    const transcript = typeof whisper.text === 'string' ? whisper.text.trim() : '';
    if (!transcript) throw new Error('Empty transcript');

    stage = 'analysis';
    providerStatus = undefined;
    const analysisResponse = await deps.fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini', temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'You are ZANG meeting assistant. Reply JSON only: ' +
              '{"title":"short meeting title","summary":"bullet-style minutes in the same language as the transcript","decisions":"confirmed decisions only, empty string if none","tasks":[{"title":"action item","assignee":null,"due_date":null}]}. ' +
              'due_date ISO date if mentioned, else null. No invented facts.',
          },
          { role: 'user', content: transcript },
        ],
      }),
    });
    providerStatus = analysisResponse.status;
    if (!analysisResponse.ok) {
      providerCode = await safeProviderCode(analysisResponse);
      throw new Error('Analysis failed');
    }
    const gpt = await analysisResponse.json();
    const analysis = JSON.parse(gpt.choices[0].message.content);
    if (!analysis || typeof analysis !== 'object') throw new Error('Invalid analysis');

    stage = 'save-meeting';
    providerStatus = undefined;
    const { error: saveError } = await client.from('meetings').update({
      title: analysis.title || meeting.title || 'Meeting',
      transcript, summary: analysis.summary || transcript.slice(0, 500),\n      decisions: typeof analysis.decisions === 'string' ? analysis.decisions.slice(0, 10000) : '',
      status: 'completed', updated_at: new Date().toISOString(),
    }).eq('id', meetingId).eq('user_id', user.id);
    if (saveError) throw new Error('Save failed');

    stage = 'save-tasks';
    const { error: deleteError } = await client.from('tasks').delete()
      .eq('meeting_id', meetingId).eq('user_id', user.id);
    if (deleteError) throw new Error('Save failed');
    const tasks = (Array.isArray(analysis.tasks) ? analysis.tasks : [])
      .filter((task: { title?: unknown } | null) => task && typeof task.title === 'string' && task.title)
      .map((task: { title: string; assignee?: string; due_date?: string }) => ({
        meeting_id: meetingId, user_id: user.id, title: task.title.slice(0, 500),
        assignee: task.assignee || null, due_date: task.due_date || null, completed: false,
      }));
    if (tasks.length) {
      const { error } = await client.from('tasks').insert(tasks);
      if (error) throw new Error('Save failed');
    }
    stage = 'read-result';
    const { data: updated, error: readError } = await client.from('meetings')
      .select('*').eq('id', meetingId).eq('user_id', user.id).single();
    const { data: savedTasks, error: tasksError } = await client.from('tasks')
      .select('*').eq('meeting_id', meetingId).eq('user_id', user.id);
    if (readError || tasksError || !updated) throw new Error('Save failed');
    return json({ success: true, meeting: updated, tasks: savedTasks || [] });
  } catch {
    // Never return provider messages, storage paths, signed URLs, or credentials.
    console.error(JSON.stringify({ event: 'zang_processing_failed', stage, providerStatus, providerCode }));
    return json({ error: 'Processing failed' }, 500, {
      'X-Zang-Processing-Stage': stage,
      ...(providerStatus ? { 'X-Zang-Provider-Status': String(providerStatus) } : {}),
      ...(providerCode ? { 'X-Zang-Provider-Code': providerCode } : {}),
    });
  }
}
