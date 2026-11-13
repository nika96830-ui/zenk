import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const ts = createRequire(import.meta.url)('typescript');
const code = readFileSync(new URL('../src/i18n/meetingAnalysisCopy.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const ctx = { exports: {} };
vm.runInNewContext(js, ctx);
test('topics and decisions have translations in all four locales', () => {
  const { getMeetingAnalysisCopy } = ctx.exports;
  for (const locale of ['az', 'en', 'tr', 'ru']) {
    const copy = getMeetingAnalysisCopy(locale);
    assert.ok(copy.topics.length > 1);
    assert.ok(copy.decisions.length > 1);
  }
  assert.notEqual(getMeetingAnalysisCopy('az').topics, getMeetingAnalysisCopy('ru').topics);
});
test('analysis view preserves recording player and editable tasks', () => {
  const page = readFileSync(new URL('../src/pages/MeetingDetail.tsx', import.meta.url), 'utf8');
  assert.match(page, /RecordingPlayer/);
  assert.match(page, /TaskEditor/);
  assert.match(page, /meeting\.topics/);
  assert.match(page, /meeting\.decisions/);
});
