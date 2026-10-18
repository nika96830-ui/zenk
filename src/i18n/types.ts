export type Locale = 'az' | 'en' | 'tr' | 'ru';

export const LOCALES: { code: Locale; label: string }[] = [
  { code: 'az', label: 'AZ' },
  { code: 'en', label: 'EN' },
  { code: 'tr', label: 'TR' },
  { code: 'ru', label: 'RU' },
];

export const DATE_LOCALES: Record<Locale, string> = {
  az: 'az-AZ',
  en: 'en-US',
  tr: 'tr-TR',
  ru: 'ru-RU',
};
