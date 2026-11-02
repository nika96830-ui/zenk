import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Minimal generated-schema contract for the tables/RPC used by this Edge Function.
// Keeping the real row and argument shapes typed prevents Supabase's untyped default
// schema from reducing query results and writes to never/undefined.
type Database = {
  public: {
    Tables: {
      meetings: {
        Row: { id: string; user_id: string; audio_path: string | null; title: string; status: string; transcript: string | null; summary: string | null; updated_at: string | null };
        Insert: { id?: string; user_id: string; audio_path?: string | null; title?: string; status?: string; transcript?: string | null; summary?: string | null; updated_at?: string | null };
        Update: { user_id?: string; audio_path?: string | null; title?: string; status?: string; transcript?: string | null; summary?: string | null; updated_at?: string | null };
        Relationships: [];
      };
      tasks: {
        Row: { id: string; meeting_id: string; user_id: string; title: string; assignee: string | null; due_date: string | null; completed: boolean; created_at: string };
        Insert: { id?: string; meeting_id: string; user_id: string; title: string; assignee?: string | null; due_date?: string | null; completed?: boolean; created_at?: string };
        Update: { meeting_id?: string; user_id?: string; title?: string; assignee?: string | null; due_date?: string | null; completed?: boolean };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      claim_meeting_processing: { Args: { p_user_id: string; p_meeting_id: string; p_audio_path: string }; Returns: boolean };
      reserve_meeting_usage: { Args: { p_user_id: string; p_meeting_id: string; p_period_start: string; p_quota: number }; Returns: boolean };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MIME_TYPES: Record<string, { extension: string; mime: string }> = {
  webm: { extension: 'webm', mime: 'audio/webm' }, m4a: { extension: 'm4a', mime: 'audio/mp4' }, mp4: { extension: 'mp4', mime: 'audio/mp4' },
  aac: { extension: 'aac', mime: 'audio/aac' }, ogg: { extension: 'ogg', mime: 'audio/ogg' }, oga: { extension: 'oga', mime: 'audio/ogg' },
  wav: { extension: 'wav', mime: 'audio/wav' }, mp3: { extension: 'mp3', mime: 'audio/mpeg' }, mpeg: { extension: 'mpeg', mime: 'audio/mpeg' },
};
const EXTENSIONS_BY_MIME: Record<string, string> = { 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mpeg': 'mp3' };
const MONTHLY_MEETING_QUOTA = 5;

function providerError(body: { error?: { code?: string } }): string {
  if (body?.error?.code === 'insufficient_quota') return 'insufficient_quota';
  if (body?.error?.code === 'invalid_api_key') return 'invalid_api_key';
  return 'Processing failed';
}
function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  return ['Monthly meeting quota exceeded', 'insufficient_quota', 'invalid_api_key', 'OPENAI_API_KEY is not configured', 'Supabase configuration is missing'].includes(message) ? message : 'Processing failed';
}

function corsHeaders(origin: string) { return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' }; }

serve(async (req) => {
  let meetingId: string | undefined; let ownerId: string | undefined; let admin: SupabaseClient<Database> | undefined; let userClient: SupabaseClient<Database> | undefined; let headers: Record<string, string> = {}; let processingStarted = false;
  try {
    // CORS is not an authorization boundary. Every processing request still verifies the
    // Supabase JWT and checks meeting ownership before using the service-role client.
    // Keep ALLOWED_ORIGIN optional because the documented setup does not require this secret.
    const configured = Deno.env.get('ALLOWED_ORIGIN');
    const origin = configured ? new URL(configured).origin : '*';
    headers = corsHeaders(origin);
    const requestOrigin = req.headers.get('Origin');
    if (configured && requestOrigin && requestOrigin !== origin) return new Response('Origin not allowed', { status: 403, headers });
    if (req.method === 'OPTIONS') return new Response('ok', { headers });
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers });
    if (!/^Bearer\s+\S+$/i.test(req.headers.get('Authorization') || '')) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    const body = await req.json(); meetingId = body.meetingId; const audioPath = body.audioPath; const language = body.language || 'ru';
    if (typeof meetingId !== 'string' || !meetingId) throw new Error('meetingId is required');
    const supabaseUrl = Deno.env.get('SUPABASE_URL'), serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), anonKey = Deno.env.get('SUPABASE_ANON_KEY'), openAiKey = Deno.env.get('OPENAI_API_KEY');
    if (!supabaseUrl || !serviceKey || !anonKey) throw new Error('Supabase configuration is missing'); if (!openAiKey) throw new Error('OPENAI_API_KEY is not configured');
    userClient = createClient<Database>(supabaseUrl, anonKey, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } });
    ownerId = user.id; admin = createClient<Database>(supabaseUrl, serviceKey);
    const { data: meeting, error: meetingError } = await userClient.from('meetings').select('id, user_id, audio_path, title').eq('id', meetingId).eq('user_id', user.id).single();
    if (meetingError || !meeting) throw new Error('Meeting not found');
    const path = meeting.audio_path; if (typeof path !== 'string' || !path.startsWith(`${user.id}/`) || path.split('/').some(part => !/^[A-Za-z0-9_.-]+$/.test(part) || part === '.' || part === '..') || (audioPath !== undefined && audioPath !== path)) throw new Error('Recording path is invalid');
    const { data: fileData, error: downloadError } = await userClient.storage.from('recordings').download(path);
    if (downloadError || !fileData) throw new Error('Failed to download recording'); if (!fileData.size) throw new Error('Empty recording'); if (fileData.size > MAX_AUDIO_BYTES) throw new Error('Recording exceeds the 25 MB limit');
    const pathExtension = path.split('.').pop()?.toLowerCase() || ''; const declaredType = fileData.type.split(';')[0].toLowerCase(); const extensionFromType = EXTENSIONS_BY_MIME[declaredType];
    const fileFormat = extensionFromType ? { extension: extensionFromType, mime: declaredType === 'audio/x-wav' ? 'audio/wav' : declaredType } : MIME_TYPES[pathExtension];
    if (!fileFormat) throw new Error('Unsupported audio format');
    const periodStart = new Date(); periodStart.setUTCDate(1); periodStart.setUTCHours(0, 0, 0, 0);
    const { data: allowed, error: quotaError } = await admin.rpc('reserve_meeting_usage', { p_user_id: user.id, p_meeting_id: meetingId, p_period_start: periodStart.toISOString().slice(0, 10), p_quota: MONTHLY_MEETING_QUOTA });
    if (quotaError) throw new Error('Unable to check meeting quota'); if (!allowed) throw new Error('Monthly meeting quota exceeded');
    // Commit a service-only, non-expiring admission record before any provider call.
    // A duplicate must not modify the winner's status or create another set of tasks.
    const { data: claimed, error: claimError } = await admin.rpc('claim_meeting_processing', { p_user_id: user.id, p_meeting_id: meetingId, p_audio_path: path });
    if (claimError) throw new Error('Unable to claim meeting processing');
    if (claimed !== true) return new Response(JSON.stringify({ error: 'MEETING_ALREADY_CLAIMED' }), { status: 409, headers: { ...headers, 'Content-Type': 'application/json' } });
    processingStarted = true;
    const { error: startError } = await userClient.from('meetings').update({ status: 'processing', updated_at: new Date().toISOString() }).eq('id', meetingId).eq('user_id', user.id);
    if (startError) throw new Error('Failed to start processing');
    const transcriptionLanguage = ['ru', 'en', 'tr', 'az'].includes(language) ? language : 'ru'; const form = new FormData(); const filename = path.split('/').pop() || `recording.${fileFormat.extension}`;
    form.append('file', new File([fileData], filename, { type: fileFormat.mime })); form.append('model', 'whisper-1'); form.append('language', transcriptionLanguage);
    const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${openAiKey}` }, body: form, signal: AbortSignal.timeout(120_000) });
    const whisperJson = await whisperResponse.json(); if (!whisperResponse.ok) throw new Error(providerError(whisperJson)); const transcript = typeof whisperJson.text === 'string' ? whisperJson.text.trim() : ''; if (!transcript) throw new Error('Empty transcript');
    const analysisResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(60_000), headers: { Authorization: `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', temperature: 0.2, max_tokens: 1200, response_format: { type: 'json_object' }, messages: [
        { role: 'system', content: 'You are Zenk meeting assistant. Reply JSON only: ' + '{"title":"short meeting title","summary":"bullet-style minutes in the same language as the transcript","tasks":[{"title":"action item","assignee":null,"due_date":null}]}. ' + 'due_date ISO date if mentioned, else null. No invented facts.' },
        { role: 'user', content: transcript },
      ] }),
    });
    const analysisJson = await analysisResponse.json(); if (!analysisResponse.ok) throw new Error(providerError(analysisJson));
    let analysis: { title?: string; summary?: string; tasks?: Array<{ title: string; assignee?: string | null; due_date?: string | null }> };
    try { analysis = JSON.parse(analysisJson.choices[0].message.content); } catch { throw new Error('Invalid GPT JSON'); }
    // JSON mode guarantees syntax only. Validate every field before changing stored data.
    if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)
      || (analysis.title !== undefined && typeof analysis.title !== 'string')
      || (analysis.summary !== undefined && typeof analysis.summary !== 'string')
      || (analysis.tasks !== undefined && !Array.isArray(analysis.tasks))) throw new Error('Invalid GPT schema');
    if ((analysis.tasks?.length || 0) > 100) throw new Error('Too many tasks');
    for (const task of analysis.tasks || []) {
      if (!task || typeof task.title !== 'string'
        || (task.assignee != null && typeof task.assignee !== 'string')
        || (task.due_date != null && (typeof task.due_date !== 'string'
          || !/^\d{4}-\d{2}-\d{2}$/.test(task.due_date)
          || !Number.isFinite(Date.parse(task.due_date))
          || new Date(task.due_date).toISOString().slice(0, 10) !== task.due_date))) throw new Error('Invalid GPT task');
    }
    const { error: updateError } = await userClient.from('meetings').update({ title: analysis.title?.trim().slice(0, 200) || meeting.title || 'Meeting', transcript, summary: analysis.summary?.slice(0, 20000) || transcript.slice(0, 500), status: 'completed', updated_at: new Date().toISOString() }).eq('id', meetingId).eq('user_id', user.id);
    if (updateError) throw new Error('Failed to save meeting analysis');
    // Build inserts from the owner-verified meeting row, not the optional request-body field.
    // The explicit Insert[] contract keeps meeting_id required at compile time.
    const taskRows: Database['public']['Tables']['tasks']['Insert'][] = (analysis.tasks || [])
      .filter((task) => typeof task?.title === 'string' && task.title.trim().length > 0)
      .map((task) => ({
        meeting_id: meeting.id,
        user_id: user.id,
        title: task.title.trim().slice(0, 500),
        assignee: task.assignee?.trim().slice(0, 200) || null,
        due_date: task.due_date || null,
        completed: false,
      }));
    if (taskRows.length) { const { error: tasksError } = await userClient.from('tasks').insert(taskRows); if (tasksError) throw new Error('Failed to save meeting tasks'); }
    const { data: updated, error: readError } = await userClient.from('meetings').select('*').eq('id', meetingId).eq('user_id', user.id).single(); const { data: tasks, error: tasksReadError } = await userClient.from('tasks').select('*').eq('meeting_id', meetingId).eq('user_id', user.id);
    if (readError || tasksReadError || !updated) throw new Error('Failed to read result');
    return new Response(JSON.stringify({ success: true, meeting: updated, tasks: tasks || [] }), { headers: { ...headers, 'Content-Type': 'application/json' } });
  } catch (error) {
    if (processingStarted && userClient && meetingId && ownerId) await userClient.from('meetings').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', meetingId).eq('user_id', ownerId);
    return new Response(JSON.stringify({ error: safeError(error) }), { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } });
  }
});
