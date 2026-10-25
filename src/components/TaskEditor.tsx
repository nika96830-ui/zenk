import { useState } from 'react';
import type { Task } from '../types';
import { useI18n } from '../i18n/I18nProvider';
import { meetingTools } from '../i18n/meetingTools';
export type TaskChanges = Pick<Task, 'title' | 'assignee' | 'deadline' | 'done'>;
export function TaskEditor({ task, onSave }: { task: Task; onSave: (changes: TaskChanges) => Promise<void> }) {
  const { locale } = useI18n(); const t = meetingTools[locale];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TaskChanges>(task);
  const [busy, setBusy] = useState(false); const [failed, setFailed] = useState(false);
  if (!editing) return <button className="btn btn-secondary" onClick={() => { setDraft(task); setFailed(false); setEditing(true); }}>{t.edit}</button>;
  return <form onSubmit={async event => {
    event.preventDefault(); if (busy || !draft.title.trim()) return;
    setBusy(true); setFailed(false);
    try { await onSave(draft); setEditing(false); } catch { setFailed(true); } finally { setBusy(false); }
  }}>
    <fieldset disabled={busy} style={{ border: 0, padding: 0, display: 'grid', gap: 8 }}>
      <label>{t.title}<input required maxLength={500} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
      <label>{t.assignee}<input maxLength={200} value={draft.assignee} onChange={e => setDraft({ ...draft, assignee: e.target.value })} /></label>
      <label>{t.deadline}<input type="date" value={draft.deadline || ''} onChange={e => setDraft({ ...draft, deadline: e.target.value })} /></label>
      <label><input type="checkbox" checked={draft.done} onChange={e => setDraft({ ...draft, done: e.target.checked })} />{t.done}</label>
      <button className="btn btn-primary" type="submit" disabled={!draft.title.trim()}>{busy ? t.saving : t.save}</button>
      <button className="btn btn-secondary" type="button" onClick={() => setEditing(false)}>{t.cancel}</button>
    </fieldset>
    {failed && <p role="alert">{t.saveError}</p>}
  </form>;
}
