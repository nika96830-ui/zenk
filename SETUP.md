# Setup Zenk

Zenk is a Vite + React web app (also packaged for mobile with Capacitor) with a Supabase backend.

## 1. Database

Open Supabase → SQL Editor, paste `supabase-schema.sql`, click Run.
Apply the database migrations in order, including the migration that removes legacy payment fields.

Create a **private** Storage bucket named `recordings` (the schema only adds the access policies, not the bucket itself).

## 2. App keys (public)

Copy `.env.example` to `.env` and fill:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

Only public values go here. Never put the OpenAI key, the Supabase service role key in `.env` or in the client.

## 3. Server secrets (Supabase)

```
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase secrets set OPENAI_API_KEY=<your_openai_api_key>
```

## 4. Deploy functions

`supabase/config.toml` keeps JWT verification enabled for both supported functions.

```
npx supabase functions deploy process-meeting
npx supabase functions deploy export-tasks
```

See `docs/EDGE_FUNCTIONS.md` for details.

After releasing, delete the previously deployed `create-checkout` and `stripe-webhook` Edge Functions and remove legacy Stripe secrets from the Supabase project. Also disable any Stripe webhook in its own dashboard; deleting code alone does not undeploy remote endpoints.

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
