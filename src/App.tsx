import { Routes, Route, useLocation } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { Onboarding } from './components/Onboarding';
import { MeetingsPage } from './pages/Meetings';
import { MeetingDetailPage } from './pages/MeetingDetail';
import { RecordPage } from './pages/Record';
import { SettingsPage } from './pages/Settings';
import { AuthPage } from './pages/Auth';
import { useOffline } from './hooks/useOffline';
import { useTheme } from './hooks/useTheme';
import { useAuth } from './hooks/useAuth';
import { updateMeetingContent, updateTaskContent } from './services/meetings';
import { usePushNotifications } from './hooks/usePushNotifications';
import { useI18n } from './i18n/I18nProvider';

export default function App() {
  const { isOnline, meetings, setMeetings, toggleTask } = useOffline();
  const { isAuthenticated, loading } = useAuth();
  const { t } = useI18n();
  useTheme();
  usePushNotifications();

  const location = useLocation();
  const hideNav = location.pathname.startsWith('/meeting/') || !isAuthenticated;

  if (loading) {
    return (
      <div className="app-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--muted)' }}>{t.loading}</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="app-shell">
        <main className="app-content" style={{ paddingBottom: 0 }}>
          <AuthPage />
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {!isOnline && <div className="offline-banner">{t.offlineBanner}</div>}
      <Onboarding />
      <main className="app-content">
        <Routes>
          <Route path="/" element={<MeetingsPage meetings={meetings} />} />
          <Route path="/meeting/:id" element={<MeetingDetailPage meetings={meetings} onToggleTask={toggleTask} onSaveMeeting={async (id, patch) => { await updateMeetingContent(id, patch); setMeetings((rows) => rows.map((row) => row.id === id ? { ...row, ...patch } : row)); }} onSaveTask={async (meetingId, task) => { await updateTaskContent(meetingId, task); setMeetings((rows) => rows.map((row) => row.id !== meetingId ? row : { ...row, tasks: row.tasks.map((item) => item.id === task.id ? { ...item, ...task } : item) })); }} />} />
          <Route path="/record" element={<RecordPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
      {!hideNav && <BottomNav />}
    </div>
  );
}
