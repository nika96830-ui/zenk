import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Minimal generated-schema contract for the tables/RPC used by this Edge Function.
// Keeping the real row and argument shapes typed prevents Supabase's untyped default
// schema from reducing query results and writes to never/undefined.
type Database = {
  public: {
    Tables: {
      meetings: {
        Row: { id: string; user_id: string; audio_path: string | null; title: string; status: string; transcript: string | null; summary: string | null; created_at: string; updated_at: string | null };
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

// Exact PR preview origin; do not accept wildcard Vercel subdomains.
const PR_PREVIEW_ORIGIN = 'https://zenk-git-fix-zenk-consolidated-security-zangui.vercel.app';
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MIME_TYPES: Record<string, { extension: string; mime: string }> = {
  webm: { extension: 'webm', mime: 'audio/webm' }, m4a: { extension: 'm4a', mime: 'audio/mp4' }, mp4: { extension: 'mp4', mime: 'audio/mp4' },
  aac: { extension: 'aac', mime: 'audio/aac' }, ogg: { extension: 'ogg', mime: 'audio/ogg' }, oga: { extension: 'oga', mime: 'audio/ogg' },
  wav: { extension: 'wav', mime: 'audio/wav' }, mp3: { extension: 'mp3', mime: 'audio/mpeg' }, mpeg: { extension: 'mpeg', mime: 'audio/mpeg' },
};
const EXTENSIONS_BY_MIME: Record<string, string> = { 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mpeg': 'mp3' };
const MONTHLY_MEETING_QUOTA = 5;

type ProcessingCode = 'insufficient_quota' | 'invalid_api_key' | 'OPENAI_ACCESS_DENIED' | 'OPENAI_MODEL_UNAVAILABLE' | 'OPENAI_RATE_LIMITED' | 'OPENAI_UNAVAILABLE' | 'OPENAI_TIMEOUT' | 'INVALID_AI_RESPONSE';
class ProcessingFailure extends Error {
  constructor(readonly publicCode: ProcessingCode, readonly httpStatus: number, readonly validationIssue?: string) { super(publicCode); }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function providerError(body: unknown, status: number): ProcessingFailure {
  const error = isRecord(body) && isRecord(body.error) ? body.error : {};
  const tags = [error.code, error.type];
  if (tags.includes('insufficient_quota')) return new ProcessingFailure('insufficient_quota', 503);
  if (tags.includes('invalid_api_key') || status === 401) return new ProcessingFailure('invalid_api_key', 503);
  if (status === 403) return new ProcessingFailure('OPENAI_ACCESS_DENIED', 503);
  if (status === 404) return new ProcessingFailure('OPENAI_MODEL_UNAVAILABLE', 503);
  if (status === 429) return new ProcessingFailure('OPENAI_RATE_LIMITED', 429);
  return new ProcessingFailure('OPENAI_UNAVAILABLE', 502);
}
async function fetchProvider(url: string, init: RequestInit): Promise<Response> {
  try { return await fetch(url, init); }
  catch (error) {
    const timeout = isRecord(error) && (error.name === 'TimeoutError' || error.name === 'AbortError');
    throw new ProcessingFailure(timeout ? 'OPENAI_TIMEOUT' : 'OPENAI_UNAVAILABLE', timeout ? 504 : 502);
  }
}
async function providerJson(response: Response): Promise<unknown> {
  let body: unknown;
  try { body = await response.json(); }
  catch {
    if (!response.ok) throw providerError(undefined, response.status);
    throw new ProcessingFailure('INVALID_AI_RESPONSE', 502);
  }
  if (!response.ok) throw providerError(body, response.status);
  return body;
}
type MeetingAnalysis = { title?: string; summary?: string; tasks: Array<{ title: string; assignee: string | null; due_date: string | null }> };
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// Schema-constrained generation still needs local validation (including calendar dates).
const ANALYSIS_FORMAT = {
  type: 'json_schema',
  json_schema: { name: 'meeting_analysis', strict: true, schema: {
    type: 'object', additionalProperties: false, required: ['title', 'summary', 'tasks'],
    properties: {
      title: { type: 'string' }, summary: { type: 'string' },
      tasks: { type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['title', 'assignee', 'due_date', 'due_in_days'],
        properties: {
          title: { type: 'string' }, assignee: { type: ['string', 'null'] },
          due_date: { type: ['string', 'null'] }, due_in_days: { type: ['integer', 'null'] },
        },
      } },
    },
  } },
};
function invalidAnalysis(issue: string): never {
  // Callers use only fixed labels; never include provider values or arbitrary property names.
  throw new ProcessingFailure('INVALID_AI_RESPONSE', 502, issue);
}
function getMeetingDate(createdAt: string, timeZone: unknown): string {
  const date = new Date(createdAt);
  if (typeof timeZone === 'string' && timeZone.length <= 64) {
    try {
      const parts = new Intl.DateTimeFormat('en', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(date);
      const { year, month, day } = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
      return [year, month, day].join('-');
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
    }
  }
  return date.toISOString().slice(0, 10);
}

function parseAnalysis(response: unknown, meetingDate: string, transcript: string): MeetingAnalysis {
  const choices = isRecord(response) ? response.choices : undefined;
  const choice = Array.isArray(choices) ? choices[0] : undefined;
  if (!isRecord(choice)) invalidAnalysis('choice');
  if (choice.finish_reason === 'length') invalidAnalysis('truncated');
  if (choice.finish_reason !== 'stop') invalidAnalysis('finish_reason');
  const message = choice.message;
  if (isRecord(message) && message.refusal != null) invalidAnalysis('refusal');
  const content = isRecord(message) ? message.content : undefined;
  if (typeof content !== 'string') invalidAnalysis('content');
  let analysis: unknown;
  try { analysis = JSON.parse(content); } catch { invalidAnalysis('json'); }
  if (!isRecord(analysis)) invalidAnalysis('root');
  if (typeof analysis.title !== 'string') invalidAnalysis('title');
  if (typeof analysis.summary !== 'string') invalidAnalysis('summary');
  if (!Array.isArray(analysis.tasks)) invalidAnalysis('tasks');
  if (analysis.tasks.length > 100) invalidAnalysis('task_count');
  const tasks: MeetingAnalysis['tasks'] = [];
  for (const item of analysis.tasks) {
    if (!isRecord(item)) invalidAnalysis('task');
    const title = item.title, assignee = item.assignee, days = item.due_in_days, date = item.due_date;
    if (typeof title !== 'string') invalidAnalysis('task_title');
    if (assignee !== null && typeof assignee !== 'string') invalidAnalysis('task_assignee');
    if (date !== null && (typeof date !== 'string' || !ISO_DATE.test(date)
      || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) invalidAnalysis('task_due_date');
    let dueDate: string | null = date;
    if (days !== null) {
      if (typeof days !== 'number' || !Number.isSafeInteger(days)) invalidAnalysis('task_due_in_days');
      // The anchor is a calendar date. UTC arithmetic here also handles DST transitions.
      const due = new Date(meetingDate);
      due.setUTCDate(due.getUTCDate() + days);
      if (!Number.isFinite(due.getTime())) invalidAnalysis('task_due_in_days');
      const day = due.toISOString().split('T')[0];
      if (!ISO_DATE.test(day)) invalidAnalysis('task_due_in_days');
      dueDate = day;
    } else if (typeof date === 'string') {
      // Preserve explicitly mentioned older years while discarding invented ones.
      const year = date.slice(0, 4);
      if (year < meetingDate.slice(0, 4) && !new RegExp('\\b' + year + '\\b').test(transcript)) dueDate = null;
    }
    tasks.push({ title, assignee, due_date: dueDate });
  }
  return { title: analysis.title, summary: analysis.summary, tasks };
}
function safeError(error: unknown): string {
  if (error instanceof ProcessingFailure) return error.publicCode;
  const message = error instanceof Error ? error.message : '';
  return ['Monthly meeting quota exceeded', 'insufficient_quota', 'invalid_api_key', 'OPENAI_API_KEY is not configured', 'Supabase configuration is missing'].includes(message) ? message : 'Processing failed';
}

function corsHeaders(origin: string) { return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' }; }

serve(async (req) => {
  let meetingId: string | undefined; let ownerId: string | undefined; let admin: SupabaseClient<Database> | undefined; let userClient: SupabaseClient<Database> | undefined; let headers: Record<string, string> = {}; let processingStarted = false; const missingConfiguration: string[] = []; let stage = 'request'; let providerStatus: number | undefined;
  try {
    // CORS is not an authorization boundary. Every processing request still verifies the
    // Supabase JWT and checks meeting ownership before using the service-role client.
    // Keep ALLOWED_ORIGIN optional because the documented setup does not require this secret.
    const configured = Deno.env.get('ALLOWED_ORIGIN');
    const allowedOrigins = configured ? configured.split(',').map(value => new URL(value.trim()).origin) : [];
    const requestOrigin = req.headers.get('Origin');
    const allowedRequestOrigin = requestOrigin && (allowedOrigins.includes(requestOrigin) || requestOrigin === PR_PREVIEW_ORIGIN)
      ? requestOrigin
      : undefined;
    headers = corsHeaders(allowedRequestOrigin ?? allowedOrigins[0] ?? '*');
    if (configured && requestOrigin && !allowedRequestOrigin) return new Response('Origin not allowed', { status: 403, headers });
    if (req.method === 'OPTIONS') return new Response('ok', { headers });
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers });
    if (!/^Bearer\s+\S+$/i.test(req.headers.get('Authorization') || '')) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    const body = await req.json(); meetingId = body.meetingId; const audioPath = body.audioPath; const language = body.language || 'ru';
    if (typeof meetingId !== 'string' || !meetingId) throw new Error('meetingId is required');
    stage = 'configuration';
    const supabaseUrl = Deno.env.get('SUPABASE_URL'), serviceKey = runtimeKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'), anonKey = runtimeKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY'), openAiKey = Deno.env.get('OPENAI_API_KEY');
    if (!supabaseUrl) missingConfiguration.push('SUPABASE_URL');
    if (!anonKey) missingConfiguration.push('SUPABASE_PUBLISHABLE_KEYS');
    if (!serviceKey) missingConfiguration.push('SUPABASE_SECRET_KEYS');
    if (!supabaseUrl || !serviceKey || !anonKey) throw new Error('Supabase configuration is missing');
    if (!openAiKey) throw new Error('OPENAI_API_KEY is not configured');
    stage = 'authentication';
    userClient = createClient<Database>(supabaseUrl, anonKey, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } });
    ownerId = user.id; admin = createClient<Database>(supabaseUrl, serviceKey);
    stage = 'meeting_lookup';
    const { data: meeting, error: meetingError } = await userClient.from('meetings').select('id, user_id, audio_path, title, created_at').eq('id', meetingId).eq('user_id', user.id).single();
    if (meetingError || !meeting) throw new Error('Meeting not found');
    const path = meeting.audio_path; if (typeof path !== 'string' || !path.startsWith(`${user.id}/`) || path.split('/').some(part => !/^[A-Za-z0-9_.-]+$/.test(part) || part === '.' || part === '..') || (audioPath !== undefined && audioPath !== path)) throw new Error('Recording path is invalid');
    if (body.action !== undefined && body.action !== 'check-ai-configuration') throw new Error('Unsupported action');
    // Authenticated owner-only metadata checks never download audio, reserve quota,
    // claim processing, or call an inference endpoint. They do not prove billing.
    if (body.action === 'check-ai-configuration') {
      const modelAccess = await Promise.all(['whisper-1', 'gpt-4o-mini'].map(async (model) => {
        try {
          const response = await fetch(`https://api.openai.com/v1/models/${model}`, {
            method: 'GET', headers: { Authorization: `Bearer ${openAiKey}` }, signal: AbortSignal.timeout(15_000),
          });
          const httpStatus = response.status;
          await response.body?.cancel();
          return { model, httpStatus };
        } catch { return { model, httpStatus: null }; }
      }));
      return new Response(JSON.stringify({ modelAccess, modelMetadataAccessible: modelAccess.every(item => item.httpStatus === 200), inferenceRequested: false, billingVerified: false }), { headers: { ...headers, 'Content-Type': 'application/json' } });
    }
    const meetingDate = getMeetingDate(meeting.created_at, body.timeZone);
    stage = 'audio_download';
    const { data: fileData, error: downloadError } = await userClient.storage.from('recordings').download(path);
    if (downloadError || !fileData) throw new Error('Failed to download recording'); if (!fileData.size) throw new Error('Empty recording'); if (fileData.size > MAX_AUDIO_BYTES) throw new Error('Recording exceeds the 25 MB limit');
    const pathExtension = path.split('.').pop()?.toLowerCase() || ''; const declaredType = fileData.type.split(';')[0].toLowerCase(); const extensionFromType = EXTENSIONS_BY_MIME[declaredType];
    const fileFormat = extensionFromType ? { extension: extensionFromType, mime: declaredType === 'audio/x-wav' ? 'audio/wav' : declaredType } : MIME_TYPES[pathExtension];
    if (!fileFormat) throw new Error('Unsupported audio format');
    const periodStart = new Date(); periodStart.setUTCDate(1); periodStart.setUTCHours(0, 0, 0, 0);
    stage = 'quota';
    const { data: allowed, error: quotaError } = await admin.rpc('reserve_meeting_usage', { p_user_id: user.id, p_meeting_id: meetingId, p_period_start: periodStart.toISOString().slice(0, 10), p_quota: MONTHLY_MEETING_QUOTA });
    if (quotaError) throw new Error('Unable to check meeting quota'); if (!allowed) throw new Error('Monthly meeting quota exceeded');
    // Commit a service-only, non-expiring admission record before any provider call.
    // A duplicate must not modify the winner's status or create another set of tasks.
    stage = 'admission';
    const { data: claimed, error: claimError } = await admin.rpc('claim_meeting_processing', { p_user_id: user.id, p_meeting_id: meetingId, p_audio_path: path });
    if (claimError) throw new Error('Unable to claim meeting processing');
    if (claimed !== true) return new Response(JSON.stringify({ error: 'MEETING_ALREADY_CLAIMED' }), { status: 409, headers: { ...headers, 'Content-Type': 'application/json' } });
    processingStarted = true;
    stage = 'start';
    const { data: started, error: startError } = await userClient.from('meetings').update({ status: 'processing', updated_at: new Date().toISOString() }).eq('id', meetingId).eq('user_id', user.id).select('id').single();
    if (startError || !started) throw new Error('Failed to start processing');
    const transcriptionLanguage = ['ru', 'en', 'tr', 'az'].includes(language) ? language : 'ru'; const form = new FormData(); const filename = path.split('/').pop() || `recording.${fileFormat.extension}`;
    form.append('file', new File([fileData], filename, { type: fileFormat.mime })); form.append('model', 'whisper-1'); form.append('language', transcriptionLanguage);
    stage = 'transcription';
    const whisperResponse = await fetchProvider('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${openAiKey}` }, body: form, signal: AbortSignal.timeout(120_000) });
    providerStatus = whisperResponse.status;
    const whisperJson = await providerJson(whisperResponse);
    const transcript = isRecord(whisperJson) && typeof whisperJson.text === 'string' ? whisperJson.text.trim() : '';
    if (!transcript) throw new ProcessingFailure('INVALID_AI_RESPONSE', 502);
    // Preserve the paid transcription even if analysis or task persistence later fails.
    // Verify the owner-visible row still exists before making another paid request.
    stage = 'transcript_save'; providerStatus = undefined;
    const { data: checkpoint, error: transcriptError } = await userClient.from('meetings').update({ transcript, updated_at: new Date().toISOString() }).eq('id', meetingId).eq('user_id', user.id).select('id').single();
    if (transcriptError || !checkpoint) throw new Error('Failed to save transcript');
    stage = 'analysis'; providerStatus = undefined;
    const analysisResponse = await fetchProvider('https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(60_000), headers: { Authorization: `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', temperature: 0.2, max_tokens: 1200, response_format: ANALYSIS_FORMAT, messages: [
        { role: 'system', content: [
          'You are the ZANG meeting assistant. Write a short title, bullet-style minutes in the same language as the transcript, and extract action items. Do not invent facts.',
          'The meeting took place on ' + meetingDate + ' (YYYY-MM-DD). Interpret deadlines relative to this local calendar date.',
          'For a relative deadline, set due_in_days to the calendar-day offset from the meeting date and set due_date to null. Today is 0, tomorrow is 1, and in two days is 2.',
          'For an explicit calendar deadline, set due_date to YYYY-MM-DD and set due_in_days to null. Use the meeting date to resolve any omitted year. If the deadline is missing or ambiguous, set both fields to null.',
        ].join('\n') },
        { role: 'user', content: transcript },
      ] }),
    });
    providerStatus = analysisResponse.status;
    const analysisJson = await providerJson(analysisResponse);
    stage = 'analysis_validation';
    const analysis = parseAnalysis(analysisJson, meetingDate, transcript);
    stage = 'meeting_save'; providerStatus = undefined;
    const { error: updateError } = await userClient.from('meetings').update({ title: analysis.title?.trim().slice(0, 200) || meeting.title || 'Meeting', transcript, summary: analysis.summary?.slice(0, 20000) || transcript.slice(0, 500), updated_at: new Date().toISOString() }).eq('id', meetingId).eq('user_id', user.id);
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
    stage = 'task_save';
    if (taskRows.length) { const { error: tasksError } = await userClient.from('tasks').insert(taskRows); if (tasksError) throw new Error('Failed to save meeting tasks'); }
    stage = 'read_result';
    const { data: tasks, error: tasksReadError } = await userClient.from('tasks').select('*').eq('meeting_id', meetingId).eq('user_id', user.id);
    if (tasksReadError) throw new Error('Failed to read result');
    // Publish completion only after analysis and all tasks are safely persisted/read.
    stage = 'completion_save';
    const { data: updated, error: completionError } = await userClient.from('meetings').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', meetingId).eq('user_id', user.id).select('*').single();
    if (completionError || !updated) throw new Error('Failed to complete meeting');
    return new Response(JSON.stringify({ success: true, meeting: updated, tasks: tasks || [] }), { headers: { ...headers, 'Content-Type': 'application/json' } });
  } catch (error) {
    // Never log keys, provider response bodies, transcript text, or request payloads.
    console.error('process-meeting failed', JSON.stringify({ stage, providerStatus, code: safeError(error), validationIssue: error instanceof ProcessingFailure ? error.validationIssue : undefined }));
    if (processingStarted && userClient && meetingId && ownerId) await userClient.from('meetings').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', meetingId).eq('user_id', ownerId);
    return new Response(JSON.stringify({ error: safeError(error), ...(missingConfiguration.length ? { missingConfiguration } : {}) }), { status: error instanceof ProcessingFailure ? error.httpStatus : 500, headers: { ...headers, 'Content-Type': 'application/json' } });
  }
});
