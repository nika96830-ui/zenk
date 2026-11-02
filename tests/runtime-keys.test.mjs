import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
for (const name of ['process-meeting', 'export-tasks']) {
  const source = readFileSync(new URL(`../supabase/functions/${name}/index.ts`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  test(`${name}: modern key maps win; absent maps support legacy; malformed maps fail closed`, () => {
    const env = { MODERN: JSON.stringify({ default: 'modern-test-value' }), LEGACY: 'legacy-test-value' };
    const context = { exports: {}, Deno: { env: { get: key => env[key] } }, require: path => path.includes('/http/server') ? { serve() {} } : {} };
    vm.createContext(context); vm.runInContext(compiled, context);
    const key = () => vm.runInContext("runtimeKey('MODERN', 'LEGACY')", context);
    assert.equal(key(), 'modern-test-value');
    env.MODERN = JSON.stringify({ 'zenk-server': 'named-test-value' });
    assert.equal(key(), 'named-test-value');
    env.MODERN = JSON.stringify({ first: 'test-one', second: 'test-two' });
    assert.equal(key(), undefined, 'do not guess between named keys');
    delete env.MODERN;
    assert.equal(key(), 'legacy-test-value');
    for (const raw of ['{invalid', 'null', '{}', '{"default":7}', '{"default":""}']) {
      env.MODERN = raw;
      assert.equal(key(), undefined);
    }
  });
}
