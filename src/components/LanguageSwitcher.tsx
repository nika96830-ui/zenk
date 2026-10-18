import { LOCALES } from '../i18n/types';
import { useI18n } from '../i18n/I18nProvider';
import { hapticLight } from '../services/haptics';

export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  return (
    <div style={{ display: 'flex', background: 'var(--parchment-dark)', borderRadius: 10, padding: 4, gap: 2 }}>
      {LOCALES.map((item) => (
        <button
          key={item.code}
          type="button"
          onClick={() => { setLocale(item.code); hapticLight(); }}
          style={{
            flex: 1, border: 'none',
            background: locale === item.code ? 'var(--white)' : 'transparent',
            color: locale === item.code ? 'var(--forest)' : 'var(--muted)',
            fontWeight: 700, fontSize: '0.8rem', padding: '8px 0', borderRadius: 8,
            boxShadow: locale === item.code ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
