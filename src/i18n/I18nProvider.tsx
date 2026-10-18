import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DICTS, type Messages } from './messages';
import { DATE_LOCALES, type Locale } from './types';

const STORAGE_KEY = 'zang-locale';

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Messages;
  interpolate: (template: string, vars: Record<string, string | number>) => string;
  dateLocale: string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function readStoredLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (saved && saved in DICTS) return saved;
  } catch {}
  return 'az';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);
  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
  }, []);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  const interpolate = useCallback((template: string, vars: Record<string, string | number>) => {
    return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''));
  }, []);
  const value = useMemo(() => ({
    locale, setLocale, t: DICTS[locale], interpolate, dateLocale: DATE_LOCALES[locale],
  }), [locale, setLocale, interpolate]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
