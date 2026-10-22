import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

function loadMapMeeting() {
  const compiled = ts.transpileModule(source('../src/lib/mapMeeting.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = { exports: {} };
  vm.runInNewContext(compiled, context);
  return context.exports;
}

test('failed meetings stay failed instead of being mapped to ready', () => {
  const { mapStatus, mapMeeting } = loadMapMeeting();
  assert.equal(mapStatus('failed'), 'failed');
  assert.equal(mapMeeting({ id: 'm-1', status: 'failed' }).status, 'failed');
  assert.equal(mapStatus('completed'), 'ready');
});

test('offline loading records MEETINGS_LOAD_FAILED and never injects demo meetings', () => {
  const code = source('../src/hooks/useOffline.ts');
  assert.doesNotMatch(code, /DEMO_MEETINGS/);
  assert.match(code, /fetchMeetings\(\)/);
  assert.match(code, /catch\(\(\) => \{\s*if \(active\) setSyncError\('MEETINGS_LOAD_FAILED'\);\s*\}\)/);
  assert.match(code, /setMeetings\(readCache\(user\.id\)\)/);
  assert.doesNotMatch(code, /setMeetings\(\s*DEMO/);
});

test('microphone tracks are released on setup failure and unmount', () => {
  const code = source('../src/pages/Record.tsx');
  const unmountEffect = /useEffect\(\(\)\s*=>\s*\(\)\s*=>\s*\{\s*streamRef\.current\?\.getTracks\(\)\.forEach\(\(track\)\s*=>\s*track\.stop\(\)\);?\s*\},\s*\[\]\);/;
  const timerEffect = code.match(/useEffect\(\(\)=>\{[\s\S]*?\},\[isRecording,isPaused\]\);/);
  assert.match(code, unmountEffect);
  assert.match(code, /streamRef\.current\?\.getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\);/);
  assert.match(code, /streamRef\.current = null;/);
  assert.match(code, /const releaseMicrophone = \(\) =>/);
  assert.match(code, /try \{\s*recorder\.stop\(\);\s*\} catch/);
  assert.match(code, /mediaRecorderRef\.current = null;/);
  assert.ok(timerEffect);
  assert.doesNotMatch(timerEffect[0], /track\.stop\(\)/);
});
test('migration and processor enforce private quota-backed recordings', () => {
  const migration = source('../supabase/migrations/20261019000000_zenk_security_usage.sql');
  const processor = source('../supabase/functions/process-meeting/index.ts');
  assert.match(migration, /protect_profile_billing_fields/);
  assert.match(migration, /reserve_meeting_usage/);
  assert.match(migration, /file_size_limit/);
  assert.match(processor, /25 \* 1024 \* 1024/);
  assert.match(processor, /reserve_meeting_usage/);
  assert.match(processor, /form\.append\('model', 'gpt-transcribe'\)/);
  assert.doesNotMatch(processor, /form\.append\('model', 'whisper-1'\)/);
  assert.match(processor, /Access-Control-Allow-Origin/);
  assert.match(processor, /configured \? new URL\(configured\)\.origin : '\*'/);
});

test('export is owner-bound and does not trust client task arrays', () => {
  const code = source('../supabase/functions/export-tasks/index.ts');
  assert.match(code, /\.eq\('user_id', user\.id\)/);
  assert.match(code, /\.eq\('meeting_id', meeting\.id\)/);
  assert.doesNotMatch(code, /body\.tasks/);
  assert.match(code, /MAX_TASKS/);
  assert.match(code, /MAX_EXPORT_BYTES/);
  assert.match(code, /csvCell/);
  assert.match(code, /protectedValue = .*test\(value\)/);
});

test('task ownership migration prevents cross-owner task assignment', () => {
  const migration = source('../supabase/migrations/20261022000000_task_meeting_ownership.sql');
  assert.match(migration, /enforce_task_meeting_owner/);
  assert.match(migration, /meeting_owner <> NEW\.user_id/);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /WITH CHECK/);
});

test('JWT, owner checks, and server-side quota reservation remain enabled', () => {
  const config = source('../supabase/config.toml');
  const processor = source('../supabase/functions/process-meeting/index.ts');
  const exportFunction = source('../supabase/functions/export-tasks/index.ts');
  const quotaMigration = source('../supabase/migrations/20261019000000_zenk_security_usage.sql');
  assert.match(config, /\[functions\.process-meeting\]\s*verify_jwt = true/);
  assert.match(config, /\[functions\.export-tasks\]\s*verify_jwt = true/);
  assert.match(processor, /auth\.getUser\(\)/);
  assert.match(processor, /\.eq\('user_id', user\.id\)/);
  assert.match(processor, /reserve_meeting_usage/);
  assert.match(exportFunction, /auth\.getUser\(\)/);
  assert.match(exportFunction, /\.eq\('user_id', user\.id\)/);
  assert.match(quotaMigration, /REVOKE ALL ON FUNCTION public\.reserve_meeting_usage/);
  assert.match(quotaMigration, /GRANT EXECUTE ON FUNCTION public\.reserve_meeting_usage\(uuid, uuid, date, integer\) TO service_role/);
});

test('normalized authentication failures are localized in every supported locale', () => {
  const auth = source('../src/pages/Auth.tsx');
  const messages = source('../src/i18n/messages.ts');
  for (const key of ['AUTH_INVALID_CREDENTIALS', 'AUTH_EMAIL_EXISTS', 'AUTH_EMAIL_NOT_CONFIRMED', 'AUTH_PASSWORD_TOO_SHORT', 'AUTH_NETWORK_ERROR', 'AUTH_RATE_LIMIT', 'AUTH_GENERIC_ERROR']) {
    assert.match(auth, new RegExp(key));
  }
  for (const phrase of ['invalidCredentials', 'emailExists', 'emailNotConfirmed', 'passwordTooShort', 'networkError', 'rateLimit', 'genericError']) {
    assert.match(messages, new RegExp(phrase));
  }
});

test('offline task save failures are surfaced and rolled back', () => {
  const code = source('../src/hooks/useOffline.ts');
  assert.match(code, /MEETINGS_LOAD_FAILED/);
  assert.match(code, /TASK_SAVE_FAILED/);
  assert.match(code, /previousDone/);
  assert.match(code, /zang-meetings-cache:/);
});


test('password recovery and email confirmation have reachable UI', () => {
  const app = source('../src/App.tsx');
  const auth = source('../src/pages/Auth.tsx');
  const reset = source('../src/pages/ResetPassword.tsx');
  const authService = source('../src/services/auth.ts');
  assert.match(app, /location\.pathname === '\/reset-password'/);
  assert.match(auth, /requestPasswordReset\(email\)/);
  assert.match(auth, /emailConfirmationSent/);
  assert.match(reset, /updatePassword\(password\)/);
  assert.match(authService, /resetPasswordForEmail/);
});

test('audio file upload is available and provider/quota errors are surfaced without raw details', () => {
  const record = source('../src/pages/Record.tsx');
  const ai = source('../src/services/ai.ts');
  assert.match(record, /type="file" accept="audio\/\*[,;]/);
  assert.match(record, /processAudio\(file, title\)/);
  assert.match(record, /MEETING_QUOTA_EXCEEDED/);
  assert.match(record, /AI_INSUFFICIENT_BALANCE/);
  assert.match(ai, /MEETING_QUOTA_EXCEEDED/);
  assert.match(ai, /AI_INSUFFICIENT_BALANCE/);
});


test('newly processed meeting is added to active state before navigation', () => {
  const app = source('../src/App.tsx');
  const record = source('../src/pages/Record.tsx');
  assert.match(record, /onMeetingCreated\(result\.meeting\)/);
  assert.match(app, /setMeetings\(\(previous\) => \[created, \.\.\.previous\.filter\(\(meeting\) => meeting\.id !== created\.id\)\]\)/);
});
