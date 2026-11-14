// Run only inside an already authorized environment holding the existing secrets.
// Read-only model metadata; never sends audio/chat, prints keys, or modifies data.
const target = 'https://pdtsjtzmuxggbxvypcis.supabase.co';
if (process.env.SUPABASE_URL?.replace(/\/$/, '') !== target) throw new Error('Wrong Supabase target; stopped');
const missing = ['SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY'].filter(name => !process.env[name]);
if (missing.length) { console.error('Missing environment variable names:', missing.join(', ')); process.exit(1); }
console.log('Required variables present (values hidden).');
for (const model of ['whisper-1', 'gpt-4o-mini']) {
  try {
    const response = await fetch(`https://api.openai.com/v1/models/${model}`, {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, signal: AbortSignal.timeout(15000),
    });
    console.log(`${model}: HTTP ${response.status}`);
    if (!response.ok) process.exitCode = 1;
    await response.body?.cancel();
  } catch { console.error(`${model}: connectivity check failed`); process.exitCode = 1; }
}
console.log('Model visibility does not prove billing balance, inference quota, or successful processing. No inference requested.');
