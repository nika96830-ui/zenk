import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { hapticLight, hapticSuccess, hapticError } from '../services/haptics';
import { useI18n } from '../i18n/I18nProvider';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

export function AuthPage() {
  const { login, register } = useAuth();
  const { t } = useI18n();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);

    try {
      await hapticLight().catch(() => undefined);
      if (mode === 'login') {
        const result = await login(email, password);
        if (!result.session) {
          setError(t.auth.sessionMissing);
          return;
        }
      } else {
        const result = await register(email, password, fullName);
        if (!result.session) setInfo(t.auth.emailConfirmationSent);
      }
      await hapticSuccess().catch(() => undefined);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t.auth.error;
      setError(message || t.auth.error);
      await hapticError().catch(() => undefined);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setError('');
    setInfo('');
  };

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '32px 24px' }}>
      <div style={{ marginBottom: 24 }}>
        <LanguageSwitcher />
      </div>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ width: 64, height: 64, background: 'var(--forest)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: 'var(--parchment)', fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 700 }}>
          Z
        </div>
        <h1 style={{ fontSize: '1.8rem', color: 'var(--forest)', marginBottom: 8 }}>{t.appName}</h1>
        <p style={{ color: 'var(--muted)' }}>{mode === 'login' ? t.auth.loginTitle : t.auth.registerTitle}</p>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {mode === 'register' && (
          <input type="text" placeholder={t.auth.name} value={fullName} onChange={(e) => setFullName(e.target.value)} style={inputStyle} />
        )}
        <input type="email" placeholder={t.auth.email} value={email} onChange={(e) => setEmail(e.target.value)} required style={inputStyle} />
        <input type="password" placeholder={t.auth.password} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} style={inputStyle} />
        {info && <p role="status" aria-live="polite" style={{ color: 'var(--forest)', fontSize: '0.9rem', textAlign: 'center' }}>{info}</p>}
        {error && <p role="alert" aria-live="assertive" style={{ color: 'var(--danger)', fontSize: '0.9rem', textAlign: 'center' }}>{error}</p>}
        <button type="submit" className="btn btn-primary btn-block" disabled={loading} style={{ marginTop: 8 }}>
          {loading ? t.loading : mode === 'login' ? t.auth.login : t.auth.register}
        </button>
      </form>
      <button onClick={switchMode} style={{ marginTop: 24, color: 'var(--forest)', fontWeight: 600, fontSize: '0.95rem', background: 'none', border: 'none' }}>
        {mode === 'login' ? t.auth.noAccount : t.auth.hasAccount}
      </button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '14px 16px', borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: '1rem', outline: 'none',
};
