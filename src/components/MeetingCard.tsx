import { useNavigate } from 'react-router-dom';
import { Clock, Users, ChevronRight } from 'lucide-react';
import type { Meeting } from '../types';
import { useI18n } from '../i18n/I18nProvider';

export function MeetingCard({ meeting }: { meeting: Meeting }) {
  const navigate = useNavigate();
  const { t, dateLocale, interpolate } = useI18n();
  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const isToday = d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    if (isToday) return `${t.meetings.today}, ${d.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })}`;
    return d.toLocaleDateString(dateLocale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };
  return (
    <article className="meeting-card" onClick={() => navigate(`/meeting/${meeting.id}`)} role="button" tabIndex={0}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <h3 style={{ fontSize: '1.05rem', color: 'var(--text)', flex: 1, paddingRight: 8 }}>{meeting.title}</h3>
        {meeting.status === 'processing' ? (
          <span className="badge badge-muted">{t.meetings.badgeProcessing}</span>
        ) : (
          <span className="badge badge-success">{t.meetings.badgeReady}</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 16, color: 'var(--muted)', fontSize: '0.85rem', marginBottom: 10 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={14} /> {formatDate(meeting.date)}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Users size={14} /> {meeting.participants.length}</span>
        <span>{meeting.duration}</span>
      </div>
      {meeting.status === 'ready' && meeting.tasks.length > 0 && (
        <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          {interpolate(t.meetings.tasksCount, { open: meeting.tasks.filter((x) => !x.done).length, done: meeting.tasks.filter((x) => x.done).length })}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}><ChevronRight size={18} color="var(--muted)" /></div>
    </article>
  );
}
