import Stripe from 'npm:stripe@23.2.0';
import { checkStripeAccount, json, sandboxClients, stripeEvents, subscriptionState } from '../_shared/stripe-sandbox.ts';

const subscribedEvents = new Set<string>(stripeEvents);
const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  const signature = request.headers.get('Stripe-Signature');
  if (!signature) return json({ error: 'INVALID_STRIPE_SIGNATURE' }, 400);
  try {
    const { stripe, database, prices } = sandboxClients();
    const webhookSecret = Deno.env.get('STRIPE_SANDBOX_WEBHOOK_SECRET');
    if (!webhookSecret?.startsWith('whsec_')) return json({ error: 'STRIPE_SANDBOX_UNAVAILABLE' }, 503);
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(await request.text(), signature, webhookSecret, undefined, cryptoProvider);
    } catch {
      return json({ error: 'INVALID_STRIPE_SIGNATURE' }, 400);
    }
    if (event.livemode || !subscribedEvents.has(event.type)) return json({ received: true });
    const object = event.data.object as Stripe.Checkout.Session | Stripe.Subscription | Stripe.Invoice;
    const customer = typeof object.customer === 'string' ? object.customer : object.customer?.id;
    if (!customer) return json({ received: true });
    if (object.object === 'checkout.session' && object.payment_status === 'unpaid'
        && event.type !== 'checkout.session.async_payment_failed') return json({ received: true });
    const { data: binding, error: bindingError } = await database.from('stripe_sandbox_customers')
      .select('user_id').eq('stripe_customer_id', customer).maybeSingle();
    if (bindingError) throw bindingError;
    if (!binding) return json({ received: true });
    await checkStripeAccount(stripe);

    // Apply the current Stripe state. An older concurrent snapshot cannot overwrite a newer one.
    const observedAt = new Date();
    const records = await stripe.subscriptions.list({ customer, status: 'all', limit: 100 });
    if (records.has_more) throw new Error('Stripe subscription list incomplete');
    const state = subscriptionState(records.data, prices, Math.floor(observedAt.getTime() / 1000));
    const { error } = await database.rpc('apply_stripe_sandbox_state', {
      p_customer_id: customer, p_event_id: event.id, p_event_type: event.type,
      p_observed_at: observedAt.toISOString(), p_plan: state.plan, p_status: state.status,
      p_period_start: state.periodStart, p_period_end: state.periodEnd,
      p_cancel_at_period_end: state.cancelAtPeriodEnd,
    });
    if (error) throw error;
    return json({ received: true });
  } catch {
    return json({ error: 'STRIPE_SANDBOX_UNAVAILABLE' }, 503);
  }
});
