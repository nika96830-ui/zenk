import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const production = 'https://zenk-zangui.vercel.app';
const preview = 'https://zenk-git-fix-zenk-consolidated-security-zangui.vercel.app';
for (const name of ['process-meeting', 'export-tasks']) {
  const source = readFileSync(new URL(`../supabase/functions/${name}/index.ts`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  function handler() {
    let serveHandler;
    vm.runInNewContext(compiled, {
      exports: {}, Request, Response, URL,
      Deno: { env: { get: key => { assert.equal(key, 'ALLOWED_ORIGIN', 'CORS/auth rejection must not access provider secrets'); return production; } } },
      require: path => path.includes('/http/server') ? { serve: fn => { serveHandler = fn; } } : { createClient: () => { throw new Error('Unexpected backend access'); } },
    });
    return serveHandler;
  }
  test(`${name}: production and exact PR preview preflight succeed, authentication stays required`, async () => {
    const serve = handler();
    for (const origin of [production, preview]) {
      const options = await serve(new Request('https://fixture.invalid', { method: 'OPTIONS', headers: { Origin: origin } }));
      assert.equal(options.status, 200);
      assert.equal(options.headers.get('Access-Control-Allow-Origin'), origin);
      assert.equal(options.headers.get('Vary'), 'Origin');
      const post = await serve(new Request('https://fixture.invalid', { method: 'POST', headers: { Origin: origin } }));
      assert.equal(post.status, 401);
    }
  });
  test(`${name}: unrelated origins and preview lookalikes stay denied`, async () => {
    const serve = handler();
    for (const origin of ['https://attacker.invalid', preview + '.attacker.invalid', preview.replace('security', 'security-other'), production + '.attacker.invalid']) {
      const response = await serve(new Request('https://fixture.invalid', { method: 'OPTIONS', headers: { Origin: origin } }));
      assert.equal(response.status, 403);
      assert.notEqual(response.headers.get('Access-Control-Allow-Origin'), origin);
    }
  });
}
