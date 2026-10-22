import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { updatePassword } from '../services/auth';
import { useI18n } from '../i18n/I18nProvider';
import { hapticError, hapticSuccess } from '../services/haptics';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError(t.auth.passwordMismatch);
      return;
    }
    setLoading(true);
    try {
      await updatePassword(password);
      setUpdated(true);
      await hapticSuccess();
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'AUTH_PASSWORD_TOO_SHORT') setError(t.auth.passwordTooShort);
      else if (code === 'AUTH_NETWORK_ERROR') setError(t.auth.networkError);
      else if (code === 'AUTH_REQUIRED') setError(t.auth.emailNotConfirmed);
      else setError(t.auth.genericError);
      await hapticError();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '32px 24px' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ width: 64, height: 64, background: 'var(--forest)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: 'var(--parchment)', fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 700 }}>Z</div>
        <h1 style={{ fontSize: '1.6rem', color: 'var(--forest)', marginBottom: 8 }}>{t.auth.resetPasswordTitle}</h1>
      </div>
      {updated ? (
        <div>
          <p role="status" style={{ textAlign: 'center', marginBottom: 20 }}>{t.auth.passwordUpdated}</p>
          <button className="btn btn-primary btn-block" onClick={() => navigate('/settings')}>{t.auth.login}</button>
        </div>
      ) : (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input type="password" autoComplete="new-password" placeholder={t.auth.newPassword} value={password} onChange={(event) => setPassword(event.target.value)} required />
          <input type="password" autoComplete="new-password" placeholder={t.auth.confirmPassword} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
          {error && <p role="alert" style={{ color: 'var(--danger)', textAlign: 'center' }}>{error}</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>{loading ? t.loading : t.auth.savePassword}</button>
        </form>
      )}
    </div>
  );
}
