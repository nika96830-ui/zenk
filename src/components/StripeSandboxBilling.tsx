import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { supabase } from '../lib/supabase';

const labels = {
  ru: { title: 'Тестовые подписки', manage: 'Управлять подпиской', failed: 'Не удалось открыть Stripe. Проверь настройки тестовой среды.', plan: 'Текущий тариф' },
  en: { title: 'Test subscriptions', manage: 'Manage subscription', failed: 'Could not open Stripe. Check your sandbox settings.', plan: 'Current plan' },
  tr: { title: 'Test abonelikleri', manage: 'Aboneliği yönet', failed: 'Stripe açılamadı. Test ortamı ayarlarını kontrol edin.', plan: 'Geçerli plan' },
  az: { title: 'Sınaq abunəlikləri', manage: 'Abunəliyi idarə et', failed: 'Stripe açıla bilmədi. Sınaq mühitinin ayarlarını yoxlayın.', plan: 'Cari tarif' },
};

export const stripeSandboxEnabled = import.meta.env.VITE_STRIPE_SANDBOX === 'true'
  && import.meta.env.VITE_SUPABASE_URL === 'https://ipozahulbphrgvzoikss.supabase.co';

export function StripeSandboxBilling({ userId }: { userId: string }) {
  const { locale } = useI18n();
  const text = labels[locale];
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<string>();
  const brandNames: Record<string, string> = { free: 'Free', freelance: 'Freelance', team: 'Team' };

  useEffect(() => {
    let mounted = true;
    async function refreshPlan() {
      const { data } = await supabase.from('profiles').select('plan').eq('id', userId).maybeSingle();
      if (mounted) setPlan(data?.plan);
    }
    void refreshPlan();
    const shouldPoll = new URLSearchParams(window.location.search).has('stripe_sandbox');
    const timer = shouldPoll ? window.setInterval(refreshPlan, 4000) : undefined;
    const stop = timer === undefined ? undefined : window.setTimeout(() => window.clearInterval(timer), 60000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, [userId]);

  async function open(action: 'checkout' | 'portal', selectedPlan?: 'freelance' | 'team') {
    setBusy(true);
    setError(false);
    try {
      const { data, error: failure } = await supabase.functions.invoke('stripe-sandbox-checkout', {
        body: { action, plan: selectedPlan },
      });
      if (failure || typeof data?.url !== 'string') throw new Error('Missing Stripe URL');
      const url = new URL(data.url);
      if (url.protocol !== 'https:' || url.hostname !== (action === 'portal' ? 'billing.stripe.com' : 'checkout.stripe.com')) {
        throw new Error('Unexpected Stripe URL');
      }
      window.location.assign(url.href);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="meeting-card" style={{ marginBottom: 24 }}>
      <h2>{text.title}</h2>
      {plan && brandNames[plan] && <p>{text.plan} · {brandNames[plan]}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button className="btn btn-secondary" disabled={busy} onClick={() => open('checkout', 'freelance')}>Freelance · $1</button>
        <button className="btn btn-secondary" disabled={busy} onClick={() => open('checkout', 'team')}>Team · $2</button>
        <button className="btn btn-secondary" disabled={busy} onClick={() => open('portal')}>{text.manage}</button>
      </div>
      {error && <p role="alert">{text.failed}</p>}
    </section>
  );
}
