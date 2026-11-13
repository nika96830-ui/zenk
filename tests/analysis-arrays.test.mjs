import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(new URL('../src/lib/mapMeeting.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const context = { exports: {} };
vm.runInNewContext(js, context);
const { mapMeeting } = context.exports;

test('topics and decisions from meeting database rows are preserved', () => {
  const meeting = mapMeeting({ id: 'a', topics: ['Roadmap', 'Budget'], decisions: ['Approved'] });
  assert.deepEqual(Array.from(meeting.topics), ['Roadmap', 'Budget']);
  assert.deepEqual(Array.from(meeting.decisions), ['Approved']);
});

test('old meeting rows without analysis fields remain compatible', () => {
  const meeting = mapMeeting({ id: 'old' });
  assert.deepEqual(Array.from(meeting.topics), []);
  assert.deepEqual(Array.from(meeting.decisions), []);
});

test('malformed database analysis fields do not leak into UI', () => {
  const meeting = mapMeeting({ id: 'a', topics: ['valid', null, 5], decisions: null });
  assert.deepEqual(Array.from(meeting.topics), ['valid']);
  assert.deepEqual(Array.from(meeting.decisions), []);
});
