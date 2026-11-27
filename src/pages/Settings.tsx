import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { StripeSandboxBilling, stripeSandboxEnabled } from '../components/StripeSandboxBilling';
import { useI18n } from '../i18n/I18nProvider';
import type { Theme } from '../types';

export function SettingsPage() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const themes: Theme[] = ['light', 'dark', 'system'];

  return (
    <div style={{ padding: '16px 16px 40px' }}>
      <header className="page-header"><h1 className="page-title">{t.settings.title}</h1></header>
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 8 }}>{t.settings.account}</h2>
        <div className="meeting-card">{user?.email || t.settings.userFallback}</div>
      </section>
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 8 }}>{t.settings.language}</h2>
        <LanguageSwitcher />
      </section>
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 8 }}>{t.settings.theme}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {themes.map((item) => (
            <button key={item} className={theme === item ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setTheme(item)}>
              {item === 'light' ? t.settings.light : item === 'dark' ? t.settings.dark : t.settings.system}
            </button>
          ))}
        </div>
      </section>
      {stripeSandboxEnabled && user && <StripeSandboxBilling userId={user.id} />}
      <button className="btn btn-secondary btn-block" onClick={() => logout()}>{t.settings.logout}</button>
      <p style={{ textAlign: 'center', color: 'var(--muted)', marginTop: 24, fontSize: '0.85rem' }}>{t.settings.version}</p>
    </div>
  );
}
