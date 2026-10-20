import { supabase } from '../lib/supabase';
import { mapMeeting } from '../lib/mapMeeting';
import type { Meeting, Task } from '../types';

export async function fetchMeetings(): Promise<Meeting[]> {
  const { data: rows, error } = await supabase.from('meetings').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  if (!rows?.length) return [];
  const { data: taskRows, error: taskError } = await supabase.from('tasks').select('*').in('meeting_id', rows.map((r) => r.id));
  if (taskError) throw taskError;
  const byMeeting = new Map<string, any[]>();
  (taskRows || []).forEach((task) => { const list = byMeeting.get(task.meeting_id) || []; list.push(task); byMeeting.set(task.meeting_id, list); });
  return rows.map((row) => mapMeeting(row, byMeeting.get(row.id) || []));
}

export async function toggleTaskRemote(taskId: string, done: boolean) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('AUTH_REQUIRED');
  const { data, error } = await supabase.from('tasks').update({ completed: done }).eq('id', taskId).eq('user_id', user.id).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('TASK_NOT_FOUND');
}

export async function updateMeetingContent(meetingId: string, patch: { summary: string; decisions: string }) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('AUTH_REQUIRED');
  const { data, error } = await supabase.from('meetings').update({ summary: patch.summary, decisions: patch.decisions, updated_at: new Date().toISOString() })
    .eq('id', meetingId).eq('user_id', user.id).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('MEETING_NOT_FOUND');
}

export async function updateTaskContent(meetingId: string, task: Pick<Task, 'id' | 'title' | 'assignee' | 'deadline'>) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('AUTH_REQUIRED');
  const { data, error } = await supabase.from('tasks').update({ title: task.title, assignee: task.assignee || null, due_date: task.deadline || null })
    .eq('id', task.id).eq('meeting_id', meetingId).eq('user_id', user.id).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('TASK_NOT_FOUND');
}
