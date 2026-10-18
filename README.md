# ZANG

AI meeting assistant: record, transcribe, summarize, tasks.

Languages: AZ | EN | TR | RU. Prices in AZN.

## Setup

1. Copy `.env.example` to `.env` and set Supabase URL + anon key.
2. Run `supabase-schema.sql` in Supabase SQL Editor.
3. Deploy Edge Functions `process-meeting` and `export-tasks`.
4. Set secret `OPENAI_API_KEY` in Supabase (not in client).

```bash
npm install
npm run dev
```

## Deploy (Vercel)

Import this repo, add env:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Framework: Vite.
