# ZANG — Supabase Edge Functions

OpenAI key only on Supabase Secrets — never in Vercel or the browser.

## Functions

| Name | Role |
|------|------|
| `process-meeting` | Audio → Whisper → GPT minutes/tasks → DB |
| `export-tasks` | CSV / Markdown export |
| `create-checkout` | Stripe Checkout session (subscriptions) |
| `stripe-webhook` | Stripe webhooks → update plan in profiles |

## Deploy

```bash
npx supabase login
npx supabase link --project-ref YOUR_REF
npx supabase secrets set OPENAI_API_KEY=<your_openai_api_key>
npx supabase secrets set STRIPE_SECRET_KEY=<your_stripe_secret_key>
npx supabase secrets set STRIPE_WEBHOOK_SECRET=<your_stripe_webhook_signing_secret>
npx supabase functions deploy process-meeting
npx supabase functions deploy export-tasks
npx supabase functions deploy create-checkout
npx supabase functions deploy stripe-webhook
```
