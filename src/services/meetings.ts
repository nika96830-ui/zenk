import { supabase } from '../lib/supabase';
import { mapMeeting, mapTask } from '../lib/mapMeeting';
import type { Meeting } from '../types';

export async function fetchMeetings(): Promise<Meeting[]> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('AUTH_REQUIRED');

  const { data: rows, error } = await supabase
    .from('meetings')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!rows?.length) return [];

  const ids = rows.map((row) => row.id);
  const { data: taskRows, error: taskError } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', user.id)
    .in('meeting_id', ids);
  if (taskError) throw taskError;

  const byMeeting = new Map<string, any[]>();
  (taskRows || []).forEach((task) => {
    const list = byMeeting.get(task.meeting_id) || [];
    list.push(task);
    byMeeting.set(task.meeting_id, list);
  });
  return rows.map((row) => mapMeeting(row, byMeeting.get(row.id) || []));
}

export async function toggleTaskRemote(taskId: string, done: boolean): Promise<void> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('AUTH_REQUIRED');

  const { data, error } = await supabase
    .from('tasks')
    .update({ completed: done })
    .eq('id', taskId)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('TASK_UPDATE_FAILED');
}

// Short-lived bearer URLs remain in component memory, never in the offline cache.
export async function getRecordingUrl(meetingId: string): Promise<string> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('AUTH_REQUIRED');
  const { data, error } = await supabase.from('meetings').select('audio_path').eq('id', meetingId).eq('user_id', user.id).single();
  const path = data?.audio_path;
  if (error || typeof path !== 'string' || !path.startsWith(`${user.id}/`) || path.split('/').some(p => p === '.' || p === '..')) throw new Error('RECORDING_UNAVAILABLE');
  const { data: signed, error: signError } = await supabase.storage.from('recordings').createSignedUrl(path, 300);
  if (signError || !signed?.signedUrl) throw new Error('RECORDING_UNAVAILABLE');
  return signed.signedUrl;
}

export async function editTaskRemote(meetingId: string, taskId: string, changes: import('../components/TaskEditor').TaskChanges): Promise<import('../types').Task> {
  const title = changes.title.trim(), assignee = changes.assignee.trim(), deadline = changes.deadline || '';
  if (!title || title.length > 500 || assignee.length > 200 || (deadline && (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || Number.isNaN(Date.parse(deadline)) || new Date(deadline).toISOString().slice(0, 10) !== deadline))) throw new Error('INVALID_TASK');
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('AUTH_REQUIRED');
  const { data, error } = await supabase.from('tasks').update({ title, assignee: assignee || null, due_date: deadline || null, completed: changes.done })
    .eq('id', taskId).eq('meeting_id', meetingId).eq('user_id', user.id).select('*').maybeSingle();
  if (error || !data) throw new Error('TASK_UPDATE_FAILED');
  return mapTask(data);
}
