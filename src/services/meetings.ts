import { supabase } from '../lib/supabase';
import { mapMeeting } from '../lib/mapMeeting';
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
