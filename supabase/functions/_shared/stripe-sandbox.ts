import Stripe from 'npm:stripe@23.2.0';
import { createClient } from 'npm:@supabase/supabase-js@2.119.2';

const sandboxSupabaseUrl = 'https://ipozahulbphrgvzoikss.supabase.co';
const sandboxStripeAccount = 'acct_1UFCS5EGUmv3Xmub';
export const sandboxAppOrigin = 'https://zenk-git-fix-zang-stripe-sandbox-zangui.vercel.app';
export const sandboxPortal = 'bpc_1UgL9yEGUmv3Xmub5BKfZWts';
export const sandboxPrices = { freelance: 'price_1UgL4hEGUmv3XmubmOQFXCcY', team: 'price_1UgL4iEGUmv3XmubkLypdSX1' };
export const stripeEvents = [
  'checkout.session.completed', 'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed', 'customer.subscription.created',
  'customer.subscription.updated', 'customer.subscription.deleted',
  'invoice.paid', 'invoice.payment_failed',
] as const;
export type PaidPlan = 'freelance' | 'team';

function loadSupabaseKey(mapName: string, legacyName: string) {
  const mapValue = Deno.env.get(mapName);
  if (!mapValue) return Deno.env.get(legacyName);
  const map: unknown = JSON.parse(mapValue);
  if (!map || typeof map !== 'object' || Array.isArray(map)) return;
  const keys = map as Record<string, unknown>;
  const values = Object.values(keys);
  const key = keys.default ?? (values.length === 1 ? values[0] : undefined);
  return typeof key === 'string' ? key : undefined;
}

export function sandboxClients() {
  const url = Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '');
  if (url !== sandboxSupabaseUrl) throw new Error('STRIPE_SANDBOX_UNAVAILABLE');
  const secretKey = Deno.env.get('STRIPE_SANDBOX_KEY');
  const serviceKey = loadSupabaseKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
  if (!secretKey || !/^(rk|sk)_test_/.test(secretKey) || !serviceKey) {
    throw new Error('STRIPE_SANDBOX_UNAVAILABLE');
  }

  return {
    stripe: new Stripe(secretKey, { maxNetworkRetries: 1, timeout: 10000 }),
    database: createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }),
    prices: sandboxPrices,
  };
}

export async function checkStripeAccount(stripe: Stripe) {
  const account = await stripe.accounts.retrieveCurrent();
  if (account.id !== sandboxStripeAccount) throw new Error('STRIPE_SANDBOX_UNAVAILABLE');
}

export function subscriptionState(subscriptions: Stripe.Subscription[], prices: Record<PaidPlan, string>, nowSeconds: number) {
  for (const subscription of subscriptions) {
    if (subscription.livemode || !['active', 'trialing'].includes(subscription.status)) continue;
    if (subscription.items.data.length !== 1 || subscription.items.has_more) continue;
    const [item] = subscription.items.data;
    const plan = item.price.id === prices.team ? 'team' : item.price.id === prices.freelance ? 'freelance' : null;
    if (!plan || item.current_period_start >= item.current_period_end || item.current_period_end <= nowSeconds) continue;
    return {
      plan,
      status: subscription.status,
      periodStart: new Date(item.current_period_start * 1000).toISOString(),
      periodEnd: new Date(item.current_period_end * 1000).toISOString(),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    };
  }
  return { plan: 'free', status: 'canceled', periodStart: null, periodEnd: null, cancelAtPeriodEnd: false };
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}
