import type { Meeting, MeetingStatus, Task } from '../types';

export function mapStatus(status?: string): MeetingStatus {
  if (status === 'processing' || status === 'recording') return status;
  return 'ready';
}

export function mapTask(row: any): Task {
  return {
    id: row.id,
    title: row.title || '',
    assignee: row.assignee || '',
    deadline: row.due_date || row.deadline || '',
    done: Boolean(row.completed ?? row.done),
  };
}

// Вспомогательная функция для корректного форматирования времени (ММ:СС)
function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function mapMeeting(row: any, tasks: any[] = []): Meeting {
  const transcript = typeof row.transcript === 'string'
    ? row.transcript.split('\n').filter(Boolean).map((text: string, i: number) => ({
        speaker: 'Speaker',
        text,
        time: formatTime(i * 5), // Теперь время корректно идет 00:00, 00:05 ... 01:05, 01:10 и т.д.
      }))
    : row.transcript || [];

  return {
    id: row.id,
    title: row.title || 'Без названия',
    date: row.created_at || new Date().toISOString(),
    duration: row.duration || '',
    status: mapStatus(row.status),
    participants: row.participants || [],
    summary: row.summary || '',
    tasks: (tasks.length ? tasks : row.tasks || []).map(mapTask),
    transcript,
  };
}