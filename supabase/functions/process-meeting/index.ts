import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { meetingId, audioPath, language = 'ru' } = await req.json();
    if (!meetingId) throw new Error('meetingId is required');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const openAiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAiKey) throw new Error('OPENAI_API_KEY is not set (Supabase secret)');

    const authHeader = req.headers.get('Authorization') || '';
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: meeting, error: mErr } = await admin
      .from('meetings')
      .select('id, user_id, audio_path, title')
      .eq('id', meetingId)
      .eq('user_id', user.id)
      .single();

    if (mErr || !meeting) throw new Error('Meeting not found');

    const path = audioPath || meeting.audio_path;
    if (!path) throw new Error('audioPath is missing');

    await admin
      .from('meetings')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', meetingId);

    const { data: fileData, error: dlErr } = await admin.storage.from('recordings').download(path);
    if (dlErr || !fileData) throw new Error('Failed to download audio: ' + (dlErr?.message || 'empty'));

    const whisperLang = ['ru', 'en', 'tr', 'az'].includes(language) ? language : 'ru';
    const form = new FormData();
    form.append('file', new File([fileData], 'audio.webm', { type: 'audio/webm' }));
    form.append('model', 'whisper-1');
    form.append('language', whisperLang);

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openAiKey}` },
      body: form,
    });
    const whisperJson = await whisperRes.json();
    if (!whisperRes.ok) {
      throw new Error(whisperJson?.error?.message || 'Whisper failed');
    }
    const transcript = (whisperJson.text || '').trim();
    if (!transcript) throw new Error('Empty transcript');

    const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are ZANG meeting assistant. Reply JSON only: ' +
              '{"title":"short meeting title","summary":"bullet-style minutes in the same language as the transcript","tasks":[{"title":"action item","assignee":null,"due_date":null}]}. ' +
              'due_date ISO date if mentioned, else null. No invented facts.',
          },
          { role: 'user', content: transcript },
        ],
      }),
    });
    const gptJson = await gptRes.json();
    if (!gptRes.ok) {
      throw new Error(gptJson?.error?.message || 'GPT failed');
    }

    let analysis: {
      title?: string;
      summary?: string;
      tasks?: Array<{ title: string; assignee?: string | null; due_date?: string | null }>;
    };
    try {
      analysis = JSON.parse(gptJson.choices[0].message.content);
    } catch {
      throw new Error('Invalid GPT JSON');
    }

    const summary = analysis.summary || transcript.slice(0, 500);
    const title = analysis.title || meeting.title || 'Meeting';

    await admin
      .from('meetings')
      .update({
        title,
        transcript,
        summary,
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', meetingId);

    await admin.from('tasks').delete().eq('meeting_id', meetingId);
    const taskRows = (analysis.tasks || [])
      .filter((t) => t?.title)
      .map((t) => ({
        meeting_id: meetingId,
        user_id: user.id,
        title: String(t.title).slice(0, 500),
        assignee: t.assignee || null,
        due_date: t.due_date || null,
        completed: false,
      }));
    if (taskRows.length) {
      await admin.from('tasks').insert(taskRows);
    }

    const { data: updated } = await admin.from('meetings').select('*').eq('id', meetingId).single();
    const { data: tasks } = await admin.from('tasks').select('*').eq('meeting_id', meetingId);

    return new Response(
      JSON.stringify({ success: true, meeting: updated, tasks: tasks || [] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
