# Zenk — Supabase Edge Functions

OpenAI key only on Supabase Secrets — never in Vercel or the browser.

## Functions

| Name | Role |
|------|------|
| `process-meeting` | Audio → Whisper → GPT minutes/tasks → DB |
| `export-tasks` | CSV / Markdown export |

## Deploy

```bash
npx supabase login
npx supabase link --project-ref YOUR_REF
npx supabase secrets set OPENAI_API_KEY=<your_openai_api_key>
npx supabase functions deploy process-meeting
npx supabase functions deploy export-tasks
```
