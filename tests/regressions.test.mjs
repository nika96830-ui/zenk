import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
const require=createRequire(import.meta.url);const ts=require('typescript');const source=(path)=>readFileSync(new URL(path,import.meta.url),'utf8');
function loadMapMeeting(){const compiled=ts.transpileModule(source('../src/lib/mapMeeting.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const context={exports:{}};vm.runInNewContext(compiled,context);return context.exports;}
test('failed meetings stay failed instead of being mapped to ready',()=>{const {mapStatus,mapMeeting}=loadMapMeeting();assert.equal(mapStatus('failed'),'failed');assert.equal(mapMeeting({id:'m-1',status:'failed'}).status,'failed');assert.equal(mapStatus('completed'),'ready');});
test('offline loading never injects demo meetings after a failed request',()=>{const code=source('../src/hooks/useOffline.ts');assert.doesNotMatch(code,/DEMO_MEETINGS/);assert.match(code,/\\.catch\\(\\(\\) => \\{\\}\\)/);});
test('microphone tracks are stopped only by the unmount cleanup',()=>{const code=source('../src/pages/Record.tsx');const unmountEffect=/useEffect\\(\\(\\)\\s*=>\\s*\\(\\)\\s*=>\\s*\\{\\s*streamRef\\.current\\?\\.getTracks\\(\\)\\.forEach\\(\\(track\\)\\s*=>\\s*track\\.stop\\(\\)\\);?\\s*\\},\\s*\\[\\]\\);/;const timerEffect=code.match(/useEffect\\(\\(\\)=>\\{[\\s\\S]*?\\},\\[isRecording,isPaused\\]\\);/);assert.match(code,unmountEffect);assert.ok(timerEffect);assert.doesNotMatch(timerEffect[0],/track\\.stop\\(\\)/);});
test('migration and processor enforce private quota-backed recordings',()=>{const migration=source('../supabase/migrations/20261019000000_zenk_security_usage.sql');const processor=source('../supabase/functions/process-meeting/index.ts');assert.match(migration,/protect_profile_billing_fields/);assert.match(migration,/reserve_meeting_usage/);assert.match(migration,/file_size_limit/);assert.match(processor,/25 \\* 1024 \\* 1024/);assert.match(processor,/reserve_meeting_usage/);assert.match(processor,/Access-Control-Allow-Origin/);});

test('Data API migration removes anonymous grants without disabling RLS',()=>{
  const migration=source('../supabase/migrations/20261024000000_explicit_api_grants.sql');
  assert.match(migration,/REVOKE ALL ON TABLE public\\.meetings, public\\.profiles, public\\.tasks FROM PUBLIC, anon/);
  assert.match(migration,/GRANT SELECT, INSERT, UPDATE, DELETE[\\s\\S]*TO authenticated/);
  assert.match(migration,/GRANT ALL[\\s\\S]*TO service_role/);
  assert.doesNotMatch(migration,/DISABLE ROW LEVEL SECURITY|DROP POLICY|DROP TABLE|TRUNCATE|DELETE FROM/i);
});
