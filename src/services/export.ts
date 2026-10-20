import { supabase } from '../lib/supabase';
export type ExportResult={success:boolean;message:string;content?:string};
export async function exportTasks(format: 'csv' | 'markdown', meetingId: string): Promise<ExportResult> {
  const { data, error } = await supabase.functions.invoke('export-tasks', { body: { format, meetingId } });
  if (error || !data?.success) return { success: false, message: 'EXPORT_FAILED' };
  if (typeof data.content === 'string') {
    const csv = format === 'csv';
    const blob = new Blob([data.content], { type: csv ? 'text/csv;charset=utf-8' : 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = csv ? 'zang-tasks.csv' : 'zang-tasks.md';
    a.click();
    URL.revokeObjectURL(url);
  }
  return data as ExportResult;
}
