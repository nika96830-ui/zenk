import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = readFileSync(new URL('../supabase/functions/process-meeting/index.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture({ allowed = true, quotaError = null, providerError = null, claimError = null, analysis = { summary: 'Synthetic summary', tasks: [{ title: 'Follow up' }] } } = {}) {
  let handler; let claimed = false; const operations = []; const calls = [];
  const meeting = { id: 'meeting-1', user_id: 'user-1', audio_path: 'user-1/audio.m4a', title: 'Fixture' };
  const client = role => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from(table) {
      let op = 'select'; const query = {
        select() { return query; }, eq() { return query; }, update() { op = 'update'; return query; }, insert() { op = 'insert'; return query; },
        single: async () => { operations.push({ role, table, op }); return { data: meeting, error: null }; },
        then(resolve) { operations.push({ role, table, op }); return Promise.resolve({ data: table === 'tasks' ? [] : meeting, error: null }).then(resolve); },
      }; return query;
    },
    storage: { from: () => ({ download: async () => { operations.push({ role, op: 'download' }); return { data: new Blob(['synthetic'], { type: 'audio/mp4' }), error: null }; } }) },
    rpc: async (name, args) => {
      if (name === 'claim_meeting_processing') {
        const accepted = !claimed && !claimError;
        if (accepted) claimed = true;
        operations.push({ role, op: 'claim', args, accepted });
        return { data: accepted, error: claimError };
      }
      operations.push({ role, op: 'quota', name, args }); return { data: allowed, error: quotaError };
    },
  });
  vm.runInNewContext(compiled, {
    exports: {}, Request, Response, File, Blob, FormData, URL, AbortSignal,
    Deno: { env: { get: key => ({ SUPABASE_URL: 'https://fixture.invalid', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', OPENAI_API_KEY: 'fake-key' })[key] } },
    require: name => name.includes('/http/server') ? { serve: fn => { handler = fn; } } : { createClient: (_url, key) => client(key) },
    fetch: async (url, options) => {
      assert.ok(operations.some(x => x.op === 'claim' && x.accepted && x.role === 'service'), 'claim before paid request');
      assert.ok(operations.some(x => x.op === 'quota' && x.role === 'service'), 'reserve quota before paid request');
      calls.push({ url, options });
      if (providerError) return new Response(JSON.stringify({ error: { code: providerError, message: 'SENSITIVE PROVIDER DETAIL' } }), { status: 429 });
      return new Response(JSON.stringify(url.includes('transcriptions') ? { text: 'Synthetic transcript' } : { choices: [{ message: { content: JSON.stringify(analysis) } }] }));
    },
  });
  return { operations, calls, request: (body = {}) => handler(new Request('https://fixture.invalid/process', { method: 'POST', headers: { Authorization: 'Bearer synthetic', 'Content-Type': 'application/json' }, body: JSON.stringify({ meetingId: meeting.id, ...body }) })) };
}
test('quota denies or fails closed without any provider call', async () => {
  for (const config of [{ allowed: false }, { quotaError: { message: 'database error' } }]) {
    const f = fixture(config); assert.equal((await f.request()).status, 500); assert.equal(f.calls.length, 0);
  }
});
test('caller cannot substitute another recording, even inside own folder', async () => {
  const f = fixture(); assert.equal((await f.request({ audioPath: 'user-1/other.m4a' })).status, 500); assert.equal(f.calls.length, 0);
});
test('mocked complete pipeline reserves service quota but uses caller RLS for all rows/audio', async () => {
  const f = fixture(); const response = await f.request(); assert.equal(response.status, 200); assert.equal(f.calls.length, 2);
  assert.ok(f.operations.filter(x => !['quota', 'claim'].includes(x.op)).every(x => x.role === 'anon'));
  assert.equal(f.operations.find(x => x.op === 'quota').args.p_quota, 5);
  assert.equal(JSON.parse(f.calls[1].options.body).max_tokens, 1200);
});
test('provider details are sanitized while billing/config codes survive', async () => {
  for (const code of ['insufficient_quota', 'invalid_api_key', 'unexpected_provider_error']) {
    const f = fixture({ providerError: code }); const text = await (await f.request()).text();
    assert.equal(f.calls.length, 1); assert.ok(!text.includes('SENSITIVE')); assert.ok(!text.includes('fake-key'));
    assert.equal(JSON.parse(text).error, code === 'unexpected_provider_error' ? 'Processing failed' : code);
  }
});

test('malformed model output never reaches a task insert', async () => {
  for (const analysis of [null, [], { tasks: {} }, { title: 7 }, { tasks: [{ title: 'Task', assignee: {} }] }, { tasks: [{ title: 'Task', due_date: '2026-02-30' }] }, { tasks: Array(101).fill({ title: 'Task' }) }]) {
    const f = fixture({ analysis });
    assert.equal((await f.request()).status, 500);
    assert.ok(!f.operations.some(x => x.op === 'insert'));
  }
});
test('rejected recording substitution does not change meeting status', async () => {
  const f = fixture();
  await f.request({ audioPath: 'user-1/other.m4a' });
  assert.ok(!f.operations.some(x => x.op === 'update'));
});

test('parallel and completed replays admit exactly one provider pipeline and one task insert', async () => {
  const f = fixture();
  const responses = await Promise.all(Array.from({ length: 12 }, () => f.request()));
  assert.equal(responses.filter(r => r.status === 200).length, 1);
  assert.equal(responses.filter(r => r.status === 409).length, 11);
  assert.equal(f.calls.length, 2);
  assert.equal(f.operations.filter(x => x.op === 'insert').length, 1);
  const writes = f.operations.filter(x => x.op === 'update').length;
  assert.equal((await f.request()).status, 409);
  assert.equal(f.calls.length, 2);
  assert.equal(f.operations.filter(x => x.op === 'update').length, writes);
});
test('provider failure keeps admission sealed on retry', async () => {
  const f = fixture({ providerError: 'insufficient_quota' });
  assert.equal((await f.request()).status, 500);
  assert.equal((await f.request()).status, 409);
  assert.equal(f.calls.length, 1);
});
test('missing migration or unavailable claim RPC fails closed before any write or provider call', async () => {
  const f = fixture({ claimError: { message: 'missing RPC' } });
  assert.equal((await f.request()).status, 500);
  assert.equal(f.calls.length, 0);
  assert.ok(!f.operations.some(x => ['insert', 'update'].includes(x.op)));
});
