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
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    await hapticLight();
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password, fullName);
      await hapticSuccess();
    } catch (err: any) {
      const code = err instanceof Error ? err.message : '';
      const localizedErrors: Record<string, string> = {
        AUTH_INVALID_CREDENTIALS: t.auth.invalidCredentials,
        AUTH_EMAIL_EXISTS: t.auth.emailExists,
        AUTH_EMAIL_NOT_CONFIRMED: t.auth.emailNotConfirmed,
        AUTH_PASSWORD_TOO_SHORT: t.auth.passwordTooShort,
        AUTH_NETWORK_ERROR: t.auth.networkError,
        AUTH_RATE_LIMIT: t.auth.rateLimit,
        AUTH_GENERIC_ERROR: t.auth.genericError,
        SESSION_RESTORE_FAILED: t.auth.genericError,
        AUTH_REQUIRED: t.auth.genericError,
      };
      setError(localizedErrors[code] || t.auth.genericError);
      await hapticError();
    } finally {
      setLoading(false);
    }
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
        {error && <p style={{ color: 'var(--danger)', fontSize: '0.9rem', textAlign: 'center' }}>{error}</p>}
        <button type="submit" className="btn btn-primary btn-block" disabled={loading} style={{ marginTop: 8 }}>
          {loading ? t.loading : mode === 'login' ? t.auth.login : t.auth.register}
        </button>
      </form>
      <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }} style={{ marginTop: 24, color: 'var(--forest)', fontWeight: 600, fontSize: '0.95rem', background: 'none', border: 'none' }}>
        {mode === 'login' ? t.auth.noAccount : t.auth.hasAccount}
      </button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '14px 16px', borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: '1rem', outline: 'none',
};
