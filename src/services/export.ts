import { supabase } from '../lib/supabase';

export type ExportResult = { success: boolean; message?: string; content?: string };

export async function exportToNotion(meetingId: string, _meetingTitle: string, _tasks: unknown[]) {
  return exportTasks('csv', meetingId);
}

export async function exportToTrello(meetingId: string, _meetingTitle: string, _tasks: unknown[]) {
  return exportTasks('markdown', meetingId);
}

async function exportTasks(format: 'csv' | 'markdown', meetingId: string): Promise<ExportResult> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { success: false, message: 'AUTH_REQUIRED' };

  // The server loads tasks from the authenticated user's meeting. Never trust client-supplied rows.
  const { data, error } = await supabase.functions.invoke('export-tasks', {
    body: { format, meetingId },
  });
  if (error || !data?.success || typeof data.content !== 'string') {
    return { success: false, message: data?.message || 'EXPORT_FAILED' };
  }

  const blob = new Blob([data.content], {
    type: format === 'csv' ? 'text/csv;charset=utf-8' : 'text/markdown;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = format === 'csv' ? 'zang-tasks.csv' : 'zang-tasks.md';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return data as ExportResult;
}
