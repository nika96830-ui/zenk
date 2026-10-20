import { useMemo, useState } from 'react';
import { MeetingCard } from '../components/MeetingCard';
import type { Meeting } from '../types';
import { List, Search } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
interface Props { meetings: Meeting[]; }
export function MeetingsPage({ meetings }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return meetings;
    return meetings.filter((m) =>
      [m.title, m.summary, m.decisions, ...(m.tasks || []).flatMap((task) => [task.title, task.assignee, task.deadline])]
        .some((value) => value?.toLocaleLowerCase().includes(needle)),
    );
  }, [meetings, query]);
  const ready = filtered.filter((m) => m.status === 'ready');
  const processing = filtered.filter((m) => m.status === 'processing');
  const failed = filtered.filter((m) => m.status === 'failed');
  return <div><header className="page-header"><h1 className="page-title">{t.meetings.title}</h1></header><div style={{ padding: '0 16px 24px' }}>
    <label style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 12px', marginBottom: 20, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--card)' }}>
      <Search size={18} aria-hidden="true" />
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.meetings.searchPlaceholder} aria-label={t.meetings.search} style={{ width: '100%', border: 0, outline: 0, background: 'transparent', color: 'var(--text)', fontSize: '1rem' }} />
    </label>
    {processing.length > 0 && <section style={{ marginBottom: 24 }}><h2 style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t.meetings.processing}</h2>{processing.map((m) => <MeetingCard key={m.id} meeting={m} />)}</section>}
    {ready.length > 0 && <section><h2 style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t.meetings.ready}</h2>{ready.map((m) => <MeetingCard key={m.id} meeting={m} />)}</section>}
    {failed.length > 0 && <section style={{ marginTop: 24 }}><h2 style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t.meetings.failed}</h2>{failed.map((m) => <MeetingCard key={m.id} meeting={m} />)}</section>}
    {meetings.length === 0 && <div className="empty-state"><List size={48} /><p>{t.meetings.emptyTitle}</p><p style={{ fontSize: '0.9rem', marginTop: 8 }}>{t.meetings.emptyHint}</p></div>}
    {meetings.length > 0 && filtered.length === 0 && <div className="empty-state"><Search size={40} /><p>{t.meetings.noSearchResults}</p></div>}
  </div></div>;
}
