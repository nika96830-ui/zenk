import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = readFileSync(new URL('../supabase/functions/process-meeting/index.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture({ allowed = true, quotaError = null, providerError = null, providerType = null, providerStatus = 429, providerErrorAt = 'transcription', rawProviderBody = null, fetchFailure = null, claimError = null, modernKeys = false, invalidMap = false, namedSecret = false, missingSecret = false, authDenied = false, modelStatus = 200, failAt = null, missingRowAt = null, finishReason = 'stop', refusal = null, analysis = { title: 'Synthetic meeting', summary: 'Synthetic summary', tasks: [{ title: 'Follow up', assignee: null, due_date: null }] } } = {}) {
  let handler; let claimed = false; const operations = []; const calls = []; const logs = []; const storedTasks = [];
  const meeting = { id: 'meeting-1', user_id: 'user-1', audio_path: 'user-1/audio.m4a', title: 'Fixture', status: 'processing', transcript: null, summary: null };
  const client = role => ({
    auth: { getUser: async () => ({ data: { user: authDenied ? null : { id: 'user-1' } }, error: null }) },
    from(table) {
      let op = 'select', values; const filters = [];
      const execute = () => {
        const phase = table === 'tasks' && op === 'insert' ? 'tasks' : op === 'update'
          ? values.status === 'failed' ? 'failure_cleanup' : values.status === 'completed' ? 'completion'
          : values.summary !== undefined ? 'summary' : values.transcript !== undefined ? 'transcript' : 'start'
          : 'read';
        operations.push({ role, table, op, phase, values, filters: [...filters] });
        if (phase === failAt) return { data: null, error: { message: 'SENSITIVE DATABASE DETAIL' } };
        if (phase === missingRowAt) return { data: null, error: null };
        if (op === 'update') Object.assign(meeting, values);
        if (op === 'insert' && table === 'tasks') storedTasks.push(...values.map((task, i) => ({ id: 'task-' + i, ...task })));
        return { data: table === 'tasks' ? storedTasks.map(task => ({ ...task })) : { ...meeting }, error: null };
      };
      const query = {
        select() { return query; }, eq(column, value) { filters.push([column, value]); return query; },
        update(data) { op = 'update'; values = data; return query; }, insert(data) { op = 'insert'; values = data; return query; },
        single: async () => execute(), then(resolve) { return Promise.resolve(execute()).then(resolve); },
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
    exports: {}, Request, Response, File, Blob, FormData, URL, AbortSignal, Error,
    console: { error: (...items) => logs.push(items.join(' ')) },
    Deno: { env: { get: key => ({ SUPABASE_PUBLISHABLE_KEYS: invalidMap ? '{broken' : modernKeys ? JSON.stringify({ default: 'modern-public' }) : undefined, SUPABASE_SECRET_KEYS: missingSecret ? '{}' : namedSecret ? JSON.stringify({ 'ZENK-server': 'modern-secret' }) : modernKeys ? JSON.stringify({ default: 'modern-secret' }) : undefined, SUPABASE_URL: 'https://fixture.invalid', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', OPENAI_API_KEY: 'fake-key' })[key] } },
    require: name => name.includes('/http/server') ? { serve: fn => { handler = fn; } } : { createClient: (_url, key) => client(key === 'modern-public' ? 'anon' : key === 'modern-secret' ? 'service' : key) },
    fetch: async (url, options) => {
      if (url.includes('/v1/models/')) { calls.push({ url, options }); return new Response('{}', { status: modelStatus }); }
      assert.ok(operations.some(x => x.op === 'claim' && x.accepted && x.role === 'service'), 'claim before paid request');
      assert.ok(operations.some(x => x.op === 'quota' && x.role === 'service'), 'reserve quota before paid request');
      const phase = url.includes('transcriptions') ? 'transcription' : 'analysis';
      if (phase === 'analysis') {
        assert.equal(meeting.transcript, 'Synthetic transcript', 'checkpoint transcription before analysis');
        assert.ok(operations.some(x => x.phase === 'transcript' && x.filters.some(([column, value]) => column === 'user_id' && value === 'user-1')));
      }
      calls.push({ url, options });
      if (fetchFailure) { const error = new Error('SENSITIVE NETWORK DETAIL'); error.name = fetchFailure; throw error; }
      if ((providerError || providerType || rawProviderBody) && phase === providerErrorAt) return new Response(rawProviderBody ?? JSON.stringify({ error: { code: providerError, type: providerType, message: 'SENSITIVE PROVIDER DETAIL' } }), { status: providerStatus });
      return new Response(JSON.stringify(phase === 'transcription' ? { text: 'Synthetic transcript' } : { choices: [{ finish_reason: finishReason, message: { refusal, content: JSON.stringify(analysis) } }] }));
    },
  });
  return { operations, calls, logs, meeting, storedTasks, request: (body = {}) => handler(new Request('https://fixture.invalid/process', { method: 'POST', headers: { Authorization: 'Bearer synthetic', 'Content-Type': 'application/json' }, body: JSON.stringify({ meetingId: meeting.id, ...body }) })) };
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
    assert.equal(JSON.parse(text).error, code === 'unexpected_provider_error' ? 'OPENAI_RATE_LIMITED' : code);
  }
});

test('malformed model output never reaches a task insert', async () => {
  for (const analysis of [null, [], { tasks: {} }, { title: 7 }, { tasks: [{ title: 'Task', assignee: {} }] }, { tasks: [{ title: 'Task', due_date: '2026-02-30' }] }, { tasks: Array(101).fill({ title: 'Task' }) }]) {
    const f = fixture({ analysis });
    const response = await f.request();
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error, 'INVALID_AI_RESPONSE');
    assert.equal(f.meeting.transcript, 'Synthetic transcript');
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
  assert.equal((await f.request()).status, 503);
  assert.equal((await f.request()).status, 409);
  assert.equal(f.calls.length, 1);
});
test('missing migration or unavailable claim RPC fails closed before any write or provider call', async () => {
  const f = fixture({ claimError: { message: 'missing RPC' } });
  assert.equal((await f.request()).status, 500);
  assert.equal(f.calls.length, 0);
  assert.ok(!f.operations.some(x => ['insert', 'update'].includes(x.op)));
});

test('modern hosted key maps are supported without enabling legacy keys', async () => {
  const f = fixture({ modernKeys: true });
  assert.equal((await f.request()).status, 200);
  assert.equal(f.calls.length, 2);
  assert.ok(f.operations.filter(x => !['quota', 'claim'].includes(x.op)).every(x => x.role === 'anon'));
});
test('invalid modern key configuration fails closed before provider requests', async () => {
  const f = fixture({ modernKeys: true, invalidMap: true });
  assert.equal((await f.request()).status, 500);
  assert.equal(f.calls.length, 0);
});

test('a sole named modern server key supports processing without a default label', async () => {
  const f = fixture({ modernKeys: true, namedSecret: true });
  assert.equal((await f.request()).status, 200);
  assert.equal(f.calls.length, 2);
});
test('missing server key is reported by variable name only and causes no inference or data write', async () => {
  const f = fixture({ modernKeys: true, missingSecret: true });
  const response = await f.request(); const body = await response.json();
  assert.equal(response.status, 500);
  assert.deepEqual(body.missingConfiguration, ['SUPABASE_SECRET_KEYS']);
  assert.equal(f.calls.length, 0);
  assert.equal(f.operations.length, 0);
  assert.ok(!JSON.stringify(body).includes('modern-secret'));
});

test('owner-only model metadata checks never infer, reserve quota, download audio or write data', async () => {
  for (const modelStatus of [200, 401, 403, 404]) {
    const f = fixture({ modelStatus });
    const response = await f.request({ action: 'check-ai-configuration' });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.inferenceRequested, false);
    assert.equal(body.billingVerified, false);
    assert.equal(body.modelMetadataAccessible, modelStatus === 200);
    assert.equal(f.calls.length, 2);
    assert.ok(f.calls.every(call => call.options.method === 'GET' && call.url.includes('/v1/models/')));
    assert.ok(f.operations.every(op => op.op === 'select'));
    assert.ok(!JSON.stringify(body).includes('fake-key'));
  }
});
test('model diagnostics require a verified user and a matching owner-bound recording', async () => {
  const anonymous = fixture({ authDenied: true });
  assert.equal((await anonymous.request({ action: 'check-ai-configuration' })).status, 401);
  assert.equal(anonymous.calls.length, 0);
  const substituted = fixture();
  assert.equal((await substituted.request({ action: 'check-ai-configuration', audioPath: 'user-1/substitute.m4a' })).status, 500);
  assert.equal(substituted.calls.length, 0);
});
test('unknown diagnostic action fails closed without inference', async () => {
  const f = fixture();
  assert.equal((await f.request({ action: 'check-ai-configuraton' })).status, 500);
  assert.equal(f.calls.length, 0);
  assert.ok(f.operations.every(op => op.op === 'select'));
});
test('failure logs identify a safe stage/status but never reveal provider details or keys', async () => {
  const f = fixture({ providerError: 'unexpected_provider_error' });
  await f.request();
  assert.match(f.logs.join(' '), /transcription/);
  assert.match(f.logs.join(' '), /429/);
  assert.ok(!f.logs.join(' ').includes('SENSITIVE'));
  assert.ok(!f.logs.join(' ').includes('fake-key'));
});

test('provider status and error type become safe actionable errors, never raw details', async () => {
  const cases = [
    [{ providerType: 'insufficient_quota', providerStatus: 429 }, 503, 'insufficient_quota'],
    [{ providerError: 'some_auth_failure', providerStatus: 401 }, 503, 'invalid_api_key'],
    [{ providerError: 'access_denied', providerStatus: 403 }, 503, 'OPENAI_ACCESS_DENIED'],
    [{ providerError: 'model_not_found', providerStatus: 404 }, 503, 'OPENAI_MODEL_UNAVAILABLE'],
    [{ providerError: 'rate_limit_exceeded', providerStatus: 429 }, 429, 'OPENAI_RATE_LIMITED'],
    [{ rawProviderBody: '<html>SENSITIVE GATEWAY DETAIL</html>', providerStatus: 502 }, 502, 'OPENAI_UNAVAILABLE'],
  ];
  for (const [config, status, code] of cases) {
    const f = fixture(config); const response = await f.request(); const body = await response.json();
    assert.equal(response.status, status); assert.equal(body.error, code);
    assert.equal(f.calls.length, 1);
    assert.ok(!JSON.stringify(body).includes('SENSITIVE'));
    assert.ok(!f.logs.join(' ').includes('SENSITIVE'));
    assert.equal((await f.request()).status, 409, 'provider failure must not reopen admission');
    assert.equal(f.calls.length, 1);
  }
});
test('timeouts and network failures are classified without retry or sensitive details', async () => {
  for (const [name, status, code] of [['TimeoutError', 504, 'OPENAI_TIMEOUT'], ['TypeError', 502, 'OPENAI_UNAVAILABLE']]) {
    const f = fixture({ fetchFailure: name }); const response = await f.request();
    assert.equal(response.status, status); assert.equal((await response.json()).error, code);
    assert.equal(f.calls.length, 1); assert.ok(!f.logs.join(' ').includes('SENSITIVE'));
  }
});
test('a failed analysis preserves the successful owner-scoped transcription', async () => {
  const f = fixture({ providerError: 'rate_limit_exceeded', providerErrorAt: 'analysis' });
  assert.equal((await f.request()).status, 429);
  assert.equal(f.meeting.transcript, 'Synthetic transcript');
  assert.equal(f.meeting.status, 'failed'); assert.equal(f.meeting.summary, null);
  assert.equal(f.calls.length, 2); assert.equal(f.storedTasks.length, 0);
  assert.equal((await f.request()).status, 409); assert.equal(f.calls.length, 2);
});
test('a missing start row or failed transcript checkpoint prevents unnecessary provider calls', async () => {
  for (const [config, expectedCalls] of [[{ missingRowAt: 'start' }, 0], [{ failAt: 'transcript' }, 1], [{ missingRowAt: 'transcript' }, 1]]) {
    const f = fixture(config); assert.equal((await f.request()).status, 500);
    assert.equal(f.calls.length, expectedCalls);
    assert.equal(f.storedTasks.length, 0);
    assert.equal((await f.request()).status, 409); assert.equal(f.calls.length, expectedCalls);
  }
});
test('task persistence failure never publishes a completed meeting and retains transcript/summary', async () => {
  const f = fixture({ failAt: 'tasks' }); assert.equal((await f.request()).status, 500);
  assert.equal(f.meeting.status, 'failed');
  assert.equal(f.meeting.transcript, 'Synthetic transcript'); assert.equal(f.meeting.summary, 'Synthetic summary');
  assert.ok(!f.operations.some(op => op.values?.status === 'completed'));
  assert.equal(f.storedTasks.length, 0);
});
test('successful completion is published only after tasks have been persisted and read', async () => {
  const f = fixture(); const response = await f.request(); const body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.meeting.status, 'completed'); assert.equal(body.tasks.length, 1);
  const insert = f.operations.findIndex(op => op.table === 'tasks' && op.op === 'insert');
  const read = f.operations.findIndex((op, index) => index > insert && op.table === 'tasks' && op.op === 'select');
  const complete = f.operations.findIndex(op => op.values?.status === 'completed');
  assert.ok(insert >= 0 && read > insert && complete > read);
  for (const op of f.operations.filter(op => op.table === 'meetings' && op.op === 'update')) {
    assert.equal(op.role, 'anon');
    assert.ok(op.filters.some(([key, value]) => key === 'id' && value === 'meeting-1'));
    assert.ok(op.filters.some(([key, value]) => key === 'user_id' && value === 'user-1'));
  }
});

test('non-JSON successful provider replies are safe upstream errors and preserve a completed transcription', async () => {
  for (const providerErrorAt of ['transcription', 'analysis']) {
    const f = fixture({ providerErrorAt, rawProviderBody: 'SENSITIVE MALFORMED RESPONSE', providerStatus: 200 });
    const response = await f.request();
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error, 'INVALID_AI_RESPONSE');
    assert.equal(f.meeting.transcript, providerErrorAt === 'analysis' ? 'Synthetic transcript' : null);
    assert.ok(!f.logs.join(' ').includes('SENSITIVE'));
  }
});
test('a failed completion write retains saved tasks but cannot duplicate them on replay', async () => {
  const f = fixture({ failAt: 'completion' });
  assert.equal((await f.request()).status, 500);
  assert.equal(f.meeting.status, 'failed');
  assert.equal(f.meeting.transcript, 'Synthetic transcript');
  assert.equal(f.storedTasks.length, 1);
  assert.equal((await f.request()).status, 409);
  assert.equal(f.calls.length, 2);
  assert.equal(f.storedTasks.length, 1);
});


test('analysis request uses strict schema matching required parser fields', async () => {
  const f = fixture(); assert.equal((await f.request()).status, 200);
  const format = JSON.parse(f.calls[1].options.body).response_format;
  assert.equal(format.type, 'json_schema'); assert.equal(format.json_schema.strict, true);
  assert.deepEqual(format.json_schema.schema.required, ['title', 'summary', 'topics', 'decisions', 'tasks']);
});
test('refused and truncated responses fail closed with safe diagnostic labels', async () => {
  for (const [config, issue] of [[{ finishReason: 'length' }, 'truncated'], [{ refusal: 'PRIVATE PROVIDER TEXT' }, 'refusal'], [{ analysis: { title: 'PRIVATE', summary: [], tasks: [] } }, 'summary']]) {
    const f = fixture(config); const response = await f.request();
    assert.equal(response.status, 502); assert.equal((await response.json()).error, 'INVALID_AI_RESPONSE');
    assert.ok(f.logs.some(log => log.includes('"validationIssue":"' + issue + '"')));
    assert.ok(!f.logs.join('').includes('PRIVATE')); assert.equal(f.storedTasks.length, 0);
    assert.equal(f.meeting.transcript, 'Synthetic transcript');
    assert.equal((await f.request()).status, 409); assert.equal(f.calls.length, 2);
  }
});

test('schema field failures retain transcript and report only a fixed field label', async () => {
  const base = { title: 'Synthetic', summary: 'Synthetic summary', tasks: [] };
  const cases = [
    [{ ...base, title: null }, 'title'], [{ ...base, tasks: {} }, 'tasks'],
    [{ ...base, tasks: [null] }, 'task'],
    [{ ...base, tasks: [{ title: 7, assignee: null, due_date: null }] }, 'task_title'],
    [{ ...base, tasks: [{ title: 'Task', assignee: {}, due_date: null }] }, 'task_assignee'],
    [{ ...base, tasks: [{ title: 'Task', assignee: null, due_date: '2026-02-30' }] }, 'task_due_date'],
  ];
  for (const [analysis, issue] of cases) {
    const f = fixture({ analysis }); assert.equal((await f.request()).status, 502);
    assert.ok(f.logs.some(log => log.includes('"validationIssue":"' + issue + '"')));
    assert.equal(f.storedTasks.length, 0); assert.equal(f.meeting.transcript, 'Synthetic transcript');
  }
  for (const due_date of [null, '2028-02-29']) {
    const f = fixture({ analysis: { ...base, tasks: [{ title: 'Task', assignee: null, due_date }] } });
    assert.equal((await f.request()).status, 200); assert.equal(f.storedTasks[0].due_date, due_date);
  }
});

test('topic/decision arrays are sanitized and written with owner-scoped meeting summary', async () => {
  const f = fixture({ analysis: { title: 'Meeting', summary: 'Summary', topics: ['  Budget  ', 'Roadmap'], decisions: [' Approved '], tasks: [] } });
  const response = await f.request();
  assert.equal(response.status, 200);
  const summary = f.operations.find(x => x.phase === 'summary');
  assert.ok(summary);
  assert.deepEqual(Array.from(summary.values.topics), ['Budget', 'Roadmap']);
  assert.deepEqual(Array.from(summary.values.decisions), ['Approved']);
  assert.ok(summary.filters.some(([column, value]) => column === 'user_id' && value === 'user-1'));
});

test('invalid AI analysis arrays fail closed before modifying meeting or tasks', async () => {
  for (const fields of [{topics: 'incorrect',decisions:[]},{topics:[null],decisions:[]},{topics:[],decisions:[42]}]) {
    const f = fixture({ analysis: {title:'Meeting',summary:'Summary',tasks:[],...fields} });
    const response = await f.request();
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error, 'INVALID_AI_RESPONSE');
    assert.ok(!f.operations.some(x => x.phase === 'summary' || x.op === 'insert'));
  }
});
