import { useState } from 'react';
import { useI18n } from '../i18n/I18nProvider';

const STORAGE_KEY = 'zang-onboarding-done';

export function Onboarding() {
  const { t } = useI18n();
  const [visible, setVisible] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) !== '1'; } catch { return true; }
  });
  const [step, setStep] = useState(0);
  if (!visible) return null;
  const steps = [
    { title: t.onboarding.s1Title, text: t.onboarding.s1Text },
    { title: t.onboarding.s2Title, text: t.onboarding.s2Text },
    { title: t.onboarding.s3Title, text: t.onboarding.s3Text },
  ];
  const close = () => { try { localStorage.setItem(STORAGE_KEY, '1'); } catch {} setVisible(false); };
  const current = steps[step];
  const last = step === steps.length - 1;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(18, 26, 25, 0.55)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ width: '100%', background: 'var(--card)', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: '28px 20px calc(28px + var(--safe-bottom))' }}>
        <h2 style={{ fontSize: '1.4rem', color: 'var(--forest)', marginBottom: 10 }}>{current.title}</h2>
        <p style={{ color: 'var(--muted)', marginBottom: 24 }}>{current.text}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={close}>{t.onboarding.skip}</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => last ? close() : setStep((s) => s + 1)}>
            {last ? t.onboarding.start : t.onboarding.next}
          </button>
        </div>
      </div>
    </div>
  );
}
