import type { Locale } from './types';

const analysisCopy: Record<Locale, { topics: string; decisions: string; noDecisions: string }> = {
  az: { topics: 'Əsas Mövzular', decisions: 'Qərarlar', noDecisions: 'Ayrıca qərar qeydi yoxdur.' },
  en: { topics: 'Key Topics', decisions: 'Decisions', noDecisions: 'No decisions were recorded.' },
  tr: { topics: 'Ana Konular', decisions: 'Kararlar', noDecisions: 'Kaydedilmiş bir karar yok.' },
  ru: { topics: 'Основные темы', decisions: 'Решения', noDecisions: 'Решения не зафиксированы.' },
};
export function getMeetingAnalysisCopy(locale: Locale) {
  return analysisCopy[locale];
}
