# ZANG — Stripe

Account: **SeyrA** — **live mode** (account ID is intentionally not stored in the repo)

## Products created

| Plan | Product ID | Price ID | Amount |
|------|------------|----------|--------|
| Freelance | `prod_VLeOQb5QSSX6ew` | `price_1UKx5m2MY8fbDWVJZkLjrOuw` | **19 AZN / month** |
| Team | `prod_VLeOuVmkDyI0oM` | `price_1UKx5p2MY8fbDWVJSdDKzdKh` | **39 AZN / month** |

## Supabase secrets

```bash
npx supabase secrets set STRIPE_SECRET_KEY=<your_stripe_secret_key>
npx supabase secrets set STRIPE_WEBHOOK_SECRET=<your_stripe_webhook_signing_secret>
npx supabase functions deploy create-checkout
npx supabase functions deploy stripe-webhook
```

## Webhook in Stripe Dashboard

1. Developers → Webhooks → Add endpoint  
2. URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`  
3. Events: `checkout.session.completed`, `customer.subscription.deleted`  
4. Copy signing secret → `STRIPE_WEBHOOK_SECRET`

## SQL

Run `supabase/migrations/add_billing_columns.sql` in SQL Editor.

## App call

```ts
const { data } = await supabase.functions.invoke('create-checkout', {
  body: { plan: 'freelance' }, // or 'team'
});
if (data?.url) window.location.href = data.url;
```
