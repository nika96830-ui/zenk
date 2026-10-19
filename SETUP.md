# Setup Zenk

Zenk is a Vite + React web app (also packaged for mobile with Capacitor) with a Supabase backend.

## 1. Database

Open Supabase → SQL Editor, paste `supabase-schema.sql`, click Run.
Then run `supabase/migrations/add_billing_columns.sql` (billing columns on `profiles`).

Create a **private** Storage bucket named `recordings` (the schema only adds the access policies, not the bucket itself).

## 2. App keys (public)

Copy `.env.example` to `.env` and fill:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

Only public values go here. Never put the OpenAI key, the Stripe secret key or the Supabase service role key in `.env` or in the client.

## 3. Server secrets (Supabase)

```
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase secrets set OPENAI_API_KEY=<your_openai_api_key>
npx supabase secrets set STRIPE_SECRET_KEY=<your_stripe_secret_key>
npx supabase secrets set STRIPE_WEBHOOK_SECRET=<your_stripe_webhook_signing_secret>
```

## 4. Deploy functions

`supabase/config.toml` keeps JWT verification on for all functions except `stripe-webhook` (Stripe signs its requests instead).

```
npx supabase functions deploy process-meeting
npx supabase functions deploy export-tasks
npx supabase functions deploy create-checkout
npx supabase functions deploy stripe-webhook
```

See `docs/EDGE_FUNCTIONS.md` and `docs/STRIPE.md` for details.

## 5. Run locally

```
npm install
npm run dev
```

## 6. Deploy web (Vercel)

Framework preset: Vite (see `vercel.json`). Add env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## 7. Mobile (Capacitor)

App id: `app.zenk.mobile`, app name: `Zenk` (see `capacitor.config.ts`).
The Capacitor CLI is not in `devDependencies` yet; install it before using `npx cap`:

```
npm install -D @capacitor/cli@7
npm run build
npx cap add android   # and/or: npx cap add ios
npx cap sync
```
