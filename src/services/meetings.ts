import { supabase } from '../lib/supabase';
import { mapMeeting } from '../lib/mapMeeting';
import type { Meeting } from '../types';

export async function fetchMeetings(): Promise<Meeting[]> {
  const { data: rows, error } = await supabase
    .from('meetings')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!rows?.length) return [];

  const ids = rows.map((r) => r.id);
  const { data: taskRows } = await supabase
    .from('tasks')
    .select('*')
    .in('meeting_id', ids);

  const byMeeting = new Map<string, any[]>();
  (taskRows || []).forEach((task) => {
    const list = byMeeting.get(task.meeting_id) || [];
    list.push(task);
    byMeeting.set(task.meeting_id, list);
  });

  return rows.map((row) => mapMeeting(row, byMeeting.get(row.id) || []));
}

export async function toggleTaskRemote(taskId: string, done: boolean) {
  await supabase.from('tasks').update({ completed: done }).eq('id', taskId);
}
