import { useParams, useNavigate } from 'react-router-dom';
import type { Meeting, Task } from '../types';
import { useI18n } from '../i18n/I18nProvider';
import { exportTasks } from '../services/export';
import { useEffect, useState } from 'react';

interface Props {
  meetings: Meeting[];
  onToggleTask: (meetingId: string, taskId: string) => void;
  onSaveMeeting: (meetingId: string, patch: { summary: string; decisions: string }) => Promise<void>;
  onSaveTask: (meetingId: string, task: Pick<Task, 'id' | 'title' | 'assignee' | 'deadline'>) => Promise<void>;
}
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', font: 'inherit' };

export function MeetingDetailPage({ meetings, onToggleTask, onSaveMeeting, onSaveTask }: Props) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [exporting, setExporting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const meeting = meetings.find((m) => m.id === id);
  const [summary, setSummary] = useState('');
  const [decisions, setDecisions] = useState('');
  const [taskDrafts, setTaskDrafts] = useState<Record<string, Pick<Task, 'title' | 'assignee' | 'deadline'>>>({});

  useEffect(() => {
    if (!meeting) return;
    setSummary(meeting.summary || '');
    setDecisions(meeting.decisions || '');
    setTaskDrafts(Object.fromEntries(meeting.tasks.map((task) => [task.id, { title: task.title, assignee: task.assignee || '', deadline: task.deadline || '' }])));
  }, [meeting?.id, meeting?.summary, meeting?.decisions, meeting?.tasks]);

  if (!meeting) return <div style={{ padding: 24 }}><button className="btn btn-secondary" onClick={() => navigate('/')}>{t.meeting.back}</button><p style={{ marginTop: 16 }}>{t.meeting.notFound}</p></div>;

  const save = async () => {
    setBusy(true); setError('');
    try {
      if (meeting.tasks.some((task) => !taskDrafts[task.id]?.title.trim())) throw new Error(t.meeting.taskTitleRequired);
      await onSaveMeeting(meeting.id, { summary, decisions });
      for (const task of meeting.tasks) {
        const draft = taskDrafts[task.id];
        if (draft && (draft.title !== task.title || draft.assignee !== task.assignee || draft.deadline !== (task.deadline || ''))) {
          if (!draft.title.trim()) throw new Error(t.meeting.taskTitleRequired);
          await onSaveTask(meeting.id, { id: task.id, title: draft.title.trim(), assignee: draft.assignee.trim(), deadline: draft.deadline || '' });
        }
      }
      setEditing(false);
    } catch { setError(t.meeting.saveFailed); }
    finally { setBusy(false); }
  };
  const doExport = async (format: 'csv' | 'markdown') => {
    if (!meeting.tasks.length) return;
    setExporting(true); setError('');
    try { const result = await exportTasks(format, meeting.id); if (!result.success) throw new Error(); }
    catch { setError(t.errors.export); }
    finally { setExporting(false); }
  };

  return <div style={{ padding: '16px 16px 40px' }}>
    <button className="btn btn-secondary" onClick={() => navigate('/')} style={{ marginBottom: 16 }}>{t.meeting.back}</button>
    <h1 style={{ fontSize: '1.4rem', color: 'var(--forest)', marginBottom: 8 }}>{meeting.title}</h1>
    {meeting.status === 'processing' ? <div className="empty-state"><p>{t.meeting.processingTitle}</p><p style={{ fontSize: '0.9rem' }}>{t.meeting.processingHint}</p></div> : <>
      <div style={{ display: 'flex', gap: 10, margin: '12px 0 20px', flexWrap: 'wrap' }}>
        {!editing ? <button className="btn btn-secondary" onClick={() => setEditing(true)}>{t.meeting.edit}</button> : <>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? t.loading : t.meeting.save}</button>
          <button className="btn btn-secondary" disabled={busy} onClick={() => { setSummary(meeting.summary || ''); setDecisions(meeting.decisions || ''); setEditing(false); }}>{t.meeting.cancel}</button>
        </>}
      </div>
      {error && <p role="alert" style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</p>}
      <h2 style={{ marginTop: 18, marginBottom: 8 }}>{t.meeting.protocol}</h2>
      {editing ? <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={7} aria-label={t.meeting.protocol} style={inputStyle} /> : <p style={{ color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{meeting.summary || t.empty.transcript}</p>}
      <h2 style={{ marginTop: 24, marginBottom: 8 }}>{t.meeting.decisions}</h2>
      {editing ? <textarea value={decisions} onChange={(e) => setDecisions(e.target.value)} rows={4} aria-label={t.meeting.decisions} style={inputStyle} /> : <p style={{ color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{meeting.decisions || t.meeting.noDecisions}</p>}
      <h2 style={{ marginTop: 24, marginBottom: 8 }}>{t.meeting.tasks}</h2>
      {meeting.tasks.length === 0 ? <p style={{ color: 'var(--muted)' }}>{t.meeting.noTasks}</p> : <ul style={{ listStyle: 'none', padding: 0 }}>
        {meeting.tasks.map((task) => {
          const draft = taskDrafts[task.id] || { title: task.title, assignee: task.assignee || '', deadline: task.deadline || '' };
          return <li key={task.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14 }}>
            <input type="checkbox" checked={task.done} onChange={() => onToggleTask(meeting.id, task.id)} aria-label={task.title} />
            <div style={{ flex: 1, display: 'grid', gap: 8 }}>
              {editing ? <>
                <input value={draft.title} onChange={(e) => setTaskDrafts((v) => ({ ...v, [task.id]: { ...draft, title: e.target.value } }))} aria-label={t.meeting.taskTitle} style={inputStyle} />
                <input value={draft.assignee} onChange={(e) => setTaskDrafts((v) => ({ ...v, [task.id]: { ...draft, assignee: e.target.value } }))} placeholder={t.meeting.assignee} aria-label={t.meeting.assignee} style={inputStyle} />
                <input type="date" value={draft.deadline} onChange={(e) => setTaskDrafts((v) => ({ ...v, [task.id]: { ...draft, deadline: e.target.value } }))} aria-label={t.meeting.deadline} style={inputStyle} />
              </> : <>
                <div style={{ textDecoration: task.done ? 'line-through' : 'none' }}>{task.title}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{task.assignee}{task.deadline ? ` · ${task.deadline}` : ''}</div>
              </>}
            </div>
          </li>;
        })}
      </ul>}
      <h2 style={{ marginTop: 24, marginBottom: 8 }}>{t.meeting.exportTitle}</h2>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" disabled={exporting || !meeting.tasks.length} onClick={() => doExport('csv')}>{exporting ? t.meeting.exporting : t.meeting.exportCsv}</button>
        <button className="btn btn-secondary" disabled={exporting || !meeting.tasks.length} onClick={() => doExport('markdown')}>{exporting ? t.meeting.exporting : t.meeting.exportMarkdown}</button>
      </div>
    </>}
  </div>;
}
