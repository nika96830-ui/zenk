import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const production = 'https://zenk-zangui.vercel.app';
const productionAlias = 'https://zenk-virid.vercel.app';
const preview = 'https://zenk-git-fix-zenk-consolidated-security-zangui.vercel.app';
for (const name of ['process-meeting', 'export-tasks']) {
  const source = readFileSync(new URL(`../supabase/functions/${name}/index.ts`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  function handler(allowedOrigins = production) {
    let serveHandler;
    vm.runInNewContext(compiled, {
      exports: {}, Request, Response, URL,
      Deno: { env: { get: key => { assert.equal(key, 'ALLOWED_ORIGIN', 'CORS/auth rejection must not access provider secrets'); return allowedOrigins; } } },
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
  test(`${name}: configured production aliases pass preflight and still require authentication`, async () => {
    const serve = handler(`${production}, ${productionAlias}`);
    for (const origin of [production, productionAlias, preview]) {
      const options = await serve(new Request('https://fixture.invalid', { method: 'OPTIONS', headers: { Origin: origin } }));
      assert.equal(options.status, 200);
      assert.equal(options.headers.get('Access-Control-Allow-Origin'), origin);
      assert.equal(options.headers.get('Vary'), 'Origin');
      const post = await serve(new Request('https://fixture.invalid', { method: 'POST', headers: { Origin: origin } }));
      assert.equal(post.status, 401);
      assert.equal(post.headers.get('Access-Control-Allow-Origin'), origin);
    }
    for (const origin of [productionAlias + '.attacker.invalid', 'https://zenk-git-main-zangui.vercel.app']) {
      const options = await serve(new Request('https://fixture.invalid', { method: 'OPTIONS', headers: { Origin: origin } }));
      assert.equal(options.status, 403);
      assert.notEqual(options.headers.get('Access-Control-Allow-Origin'), origin);
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
  test(`${name}: omitting the origin setting preserves the optional CORS configuration`, async () => {
    const serve = handler('');
    const headers = { Origin: production };
    const options = await serve(new Request('https://fixture.invalid', { method: 'OPTIONS', headers }));
    assert.equal(options.status, 200);
    assert.equal(options.headers.get('Access-Control-Allow-Origin'), '*');
    const post = await serve(new Request('https://fixture.invalid', { method: 'POST', headers }));
    assert.equal(post.status, 401);
  });
}
