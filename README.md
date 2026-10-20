# Zenk

Zenk — AI assistant for work meetings: record, transcribe, summarize, extract tasks.

Languages: AZ | EN | TR | RU. The initial release has no payment or subscription features.

## Setup

Full step-by-step guide: [SETUP.md](SETUP.md).

1. Copy `.env.example` to `.env` and set Supabase URL + anon key.
2. Run `supabase-schema.sql` in Supabase SQL Editor.
3. Deploy Edge Functions `process-meeting`, `export-tasks`.
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

## Docs

- [docs/EDGE_FUNCTIONS.md](docs/EDGE_FUNCTIONS.md) — Supabase Edge Functions

## History and backups

This repository was created with a clean history by importing files (not a fork) from the earlier prototypes.
The original repositories are kept unchanged as backups:

- `nika96830-ui/zang-app` — source of the web app code, Edge Functions and SQL
- `nika96830-ui/zang` — source of `capacitor.config.ts`, Dependabot config, `supabase/config.toml` and `SETUP.md`

Do not develop in the backup repositories; all new work happens here.
