import { useParams, useNavigate } from 'react-router-dom';
import type { Meeting } from '../types';
import { useI18n } from '../i18n/I18nProvider';
import { exportToNotion, exportToTrello } from '../services/export';
import { useState } from 'react';

interface Props {
  meetings: Meeting[];
  onToggleTask: (meetingId: string, taskId: string) => void;
}

export function MeetingDetailPage({ meetings, onToggleTask }: Props) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [exporting, setExporting] = useState(false);
  const meeting = meetings.find((m) => m.id === id);

  if (!meeting) {
    return (
      <div style={{ padding: 24 }}>
        <button className="btn btn-secondary" onClick={() => navigate('/')}>{t.meeting.back}</button>
        <p style={{ marginTop: 16 }}>{t.meeting.notFound}</p>
      </div>
    );
  }

  const doExport = async (target: 'notion' | 'trello') => {
    if (!meeting.tasks.length) return;
    setExporting(true);
    try {
      if (target === 'notion') await exportToNotion(meeting.title, meeting.tasks);
      else await exportToTrello(meeting.title, meeting.tasks);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ padding: '16px 16px 40px' }}>
      <button className="btn btn-secondary" onClick={() => navigate('/')} style={{ marginBottom: 16 }}>{t.meeting.back}</button>
      <h1 style={{ fontSize: '1.4rem', color: 'var(--forest)', marginBottom: 8 }}>{meeting.title}</h1>
      {meeting.status === 'processing' ? (
        <div className="empty-state">
          <p>{t.meeting.processingTitle}</p>
          <p style={{ fontSize: '0.9rem' }}>{t.meeting.processingHint}</p>
        </div>
      ) : (
        <>
          <h2 style={{ marginTop: 24, marginBottom: 8 }}>{t.meeting.protocol}</h2>
          <p style={{ color: 'var(--text)', lineHeight: 1.5 }}>{meeting.summary || t.empty.transcript}</p>
          <h2 style={{ marginTop: 24, marginBottom: 8 }}>{t.meeting.tasks}</h2>
          {meeting.tasks.length === 0 ? <p style={{ color: 'var(--muted)' }}>{t.meeting.noTasks}</p> : (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {meeting.tasks.map((task) => (
                <li key={task.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
                  <input type="checkbox" checked={task.done} onChange={() => onToggleTask(meeting.id, task.id)} />
                  <div>
                    <div style={{ textDecoration: task.done ? 'line-through' : 'none' }}>{task.title}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{task.assignee}{task.deadline ? ` · ${task.deadline}` : ''}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <h2 style={{ marginTop: 24, marginBottom: 8 }}>{t.meeting.exportTitle}</h2>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" disabled={exporting || !meeting.tasks.length} onClick={() => doExport('notion')}>{t.meeting.exportNotion}</button>
            <button className="btn btn-secondary" disabled={exporting || !meeting.tasks.length} onClick={() => doExport('trello')}>{t.meeting.exportTrello}</button>
          </div>
        </>
      )}
    </div>
  );
}
