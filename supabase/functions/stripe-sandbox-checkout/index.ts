import { checkStripeAccount, json, sandboxAppOrigin, sandboxClients, sandboxPortal } from '../_shared/stripe-sandbox.ts';

Deno.serve(async (request) => {
  let headers: Record<string, string> = {};
  try {
    const origin = sandboxAppOrigin;
    if (request.headers.get('Origin') !== origin) return json({ error: 'ORIGIN_NOT_ALLOWED' }, 403);
    headers = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405, headers);
    const token = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token) return json({ error: 'UNAUTHORIZED' }, 401, headers);
    const { stripe, database, prices } = sandboxClients();
    const { data: { user }, error: authError } = await database.auth.getUser(token);
    if (authError || !user) return json({ error: 'UNAUTHORIZED' }, 401, headers);
    const body = await request.json().catch(() => null);
    const action = body?.action;
    const plan = body?.plan;
    if (action !== 'portal' && (action !== 'checkout' || (plan !== 'freelance' && plan !== 'team'))) {
      return json({ error: 'INVALID_BILLING_ACTION' }, 400, headers);
    }
    await checkStripeAccount(stripe);
    const findCustomer = async () => {
      const { data, error } = await database.from('stripe_sandbox_customers')
        .select('stripe_customer_id').eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      return data?.stripe_customer_id;
    };
    let customer = await findCustomer();
    const returnUrl = origin + '/settings';
    if (action === 'portal') {
      if (!customer) return json({ error: 'NO_SUBSCRIPTION' }, 404, headers);
      const session = await stripe.billingPortal.sessions.create({ customer, configuration: sandboxPortal, return_url: returnUrl });
      return json({ url: session.url }, 200, headers);
    }
    if (!customer) {
      const { error: profileError } = await database.from('profiles')
        .upsert({ id: user.id }, { onConflict: 'id', ignoreDuplicates: true });
      if (profileError) throw profileError;
      const created = await stripe.customers.create({}, { idempotencyKey: 'zang-sandbox-customer-' + user.id });
      if (created.livemode) throw new Error('Wrong Stripe mode');
      const { error } = await database.from('stripe_sandbox_customers')
        .upsert({ user_id: user.id, stripe_customer_id: created.id }, { onConflict: 'user_id', ignoreDuplicates: true });
      if (error) throw error;
      customer = await findCustomer();
      if (!customer) throw new Error('Stripe customer binding missing');
    }
    const subscriptions = await stripe.subscriptions.list({ customer, status: 'all', limit: 100 });
    if (subscriptions.has_more || subscriptions.data.some(({ status }) => !['canceled', 'incomplete_expired'].includes(status))) {
      return json({ error: 'SUBSCRIPTION_ALREADY_EXISTS' }, 409, headers);
    }
    const { data: acquired, error: claimError } = await database.rpc('claim_stripe_sandbox_checkout', { p_user_id: user.id });
    if (claimError) throw claimError;
    if (!acquired) return json({ error: 'CHECKOUT_IN_PROGRESS' }, 409, headers);
    const price = prices[plan as keyof typeof prices];
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription', customer, line_items: [{ price, quantity: 1 }],
      subscription_data: { billing_mode: { type: 'flexible' } },
      success_url: returnUrl + '?stripe_sandbox=returned',
      cancel_url: returnUrl + '?stripe_sandbox=cancelled',
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      integration_identifier: 'zang-sandbox-qxkrmznt',
    });
    if (session.livemode || !session.url) throw new Error('Unexpected Checkout session');
    return json({ url: session.url }, 200, headers);
  } catch {
    return json({ error: 'STRIPE_SANDBOX_UNAVAILABLE' }, 503, headers);
  }
});
