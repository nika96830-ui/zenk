import { Routes, Route, useLocation } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { Onboarding } from './components/Onboarding';
import { MeetingsPage } from './pages/Meetings';
import { MeetingDetailPage } from './pages/MeetingDetail';
import { RecordPage } from './pages/Record';
import { SettingsPage } from './pages/Settings';
import { AuthPage } from './pages/Auth';
import { ResetPasswordPage } from './pages/ResetPassword';
import { useOffline } from './hooks/useOffline';
import { useTheme } from './hooks/useTheme';
import { useAuth } from './hooks/useAuth';
import { usePushNotifications } from './hooks/usePushNotifications';
import { useI18n } from './i18n/I18nProvider';

export default function App() {
  const { isOnline, meetings, setMeetings, toggleTask, editTask } = useOffline();
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

  if (location.pathname === '/reset-password') {
    return (
      <div className="app-shell">
        <main className="app-content" style={{ paddingBottom: 0 }}>
          <ResetPasswordPage />
        </main>
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
          <Route path="/meeting/:id" element={<MeetingDetailPage meetings={meetings} onToggleTask={toggleTask} onEditTask={editTask} />} />
          <Route path="/record" element={<RecordPage onMeetingCreated={(created) => setMeetings((previous) => [created, ...previous.filter((meeting) => meeting.id !== created.id)])} />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
      {!hideNav && <BottomNav />}
    </div>
  );
}
