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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const format = body.format === 'markdown' ? 'markdown' : 'csv';
    let tasks = body.tasks || [];

    if (body.meetingId && (!tasks || !tasks.length)) {
      const { data } = await userClient
        .from('tasks')
        .select('title, assignee, due_date, completed')
        .eq('meeting_id', body.meetingId);
      tasks = data || [];
    }

    if (!tasks.length) {
      return new Response(JSON.stringify({ success: false, message: 'No tasks' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let content = '';
    if (format === 'csv') {
      content =
        'Task,Assignee,Deadline,Done\n' +
        tasks
          .map(
            (t: any) =>
              `"${String(t.title || '').replace(/"/g, '""')}","${t.assignee || ''}","${t.due_date || t.deadline || ''}","${t.completed ? 'yes' : 'no'}"`,
          )
          .join('\n');
    } else {
      const heading = body.meetingTitle ? `# ${body.meetingTitle}\n\n` : '';
      content =
        heading +
        tasks
          .map(
            (t: any) =>
              `- [${t.completed ? 'x' : ' '}] ${t.title || ''}${t.assignee ? ` (@${t.assignee})` : ''}${t.due_date ? ` — ${t.due_date}` : ''}`,
          )
          .join('\n');
    }

    return new Response(JSON.stringify({ success: true, content, format }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, message: err?.message || 'Error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
