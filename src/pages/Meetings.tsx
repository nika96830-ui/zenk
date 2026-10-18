import { MeetingCard } from '../components/MeetingCard';
import type { Meeting } from '../types';
import { List } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';

interface Props { meetings: Meeting[]; }

export function MeetingsPage({ meetings }: Props) {
  const { t } = useI18n();
  const ready = meetings.filter((m) => m.status === 'ready');
  const processing = meetings.filter((m) => m.status === 'processing');
  return (
    <div>
      <header className="page-header"><h1 className="page-title">{t.meetings.title}</h1></header>
      <div style={{ padding: '0 16px 24px' }}>
        {processing.length > 0 && (
          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t.meetings.processing}</h2>
            {processing.map((m) => <MeetingCard key={m.id} meeting={m} />)}
          </section>
        )}
        {ready.length > 0 ? (
          <section>
            <h2 style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t.meetings.ready}</h2>
            {ready.map((m) => <MeetingCard key={m.id} meeting={m} />)}
          </section>
        ) : (
          <div className="empty-state">
            <List size={48} />
            <p>{t.meetings.emptyTitle}</p>
            <p style={{ fontSize: '0.9rem', marginTop: 8 }}>{t.meetings.emptyHint}</p>
          </div>
        )}
      </div>
    </div>
  );
}
