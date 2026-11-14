// Isolated diagnostic page: no credentials, hosted writes, or provider requests.
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { createServer } from 'vite';
const engine = process.env.ZANG_BROWSER || 'chromium';
const server = await createServer({ server: { host: '127.0.0.1', port: 4176, strictPort: true } });
await server.listen();
let browser;
try {
  browser = await ({ chromium, webkit })[engine].launch(engine === 'chromium' ? { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } : {});
  const page = await browser.newPage();
  const requests = [];
  page.on('request', req => requests.push(req.url()));
  await page.goto('http://127.0.0.1:4176/qa/iphone-audio.html');
  await page.waitForFunction(() => document.getElementById('report').textContent.includes('MediaRecorder'));
  assert.equal(await page.title(), 'ZENK — проверка аудио на iPhone');
  assert.equal(await page.evaluate(async () => {
    try { await fetch('https://example.invalid/must-be-blocked'); return false; } catch { return true; }
  }), true, 'CSP forbids any API network request');
  // A synthetic WAV is enough to check local blob handling; actual device mic remains manual.
  const wav = Buffer.alloc(8044);
  wav.write('RIFF'); wav.writeUInt32LE(8036, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(8000, 40);
  await page.locator('#file').setInputFiles({ name: 'synthetic.wav', mimeType: 'audio/wav', buffer: wav });
  assert.match(await page.locator('#player').getAttribute('src'), /^blob:/);
  await page.evaluate(() => document.getElementById('player').play());
  await page.waitForFunction(() => document.getElementById('player').ended);
  await page.locator('#clear').click();
  assert.equal(await page.locator('#player').getAttribute('src'), null);
  await page.locator('#file').setInputFiles({ name: 'empty.m4a', mimeType: 'audio/mp4', buffer: Buffer.alloc(0) });
  assert.match(await page.locator('#status').textContent(), /Пустая запись/);
  if (engine === 'chromium') {
    await page.locator('#start').click();
    await page.waitForFunction(() => document.getElementById('status').textContent === 'Идёт локальная запись.');
    await page.locator('#pause').click();
    assert.equal(await page.locator('#status').textContent(), 'Пауза.');
    await page.locator('#pause').click();
    await page.locator('#stop').click();
    await page.waitForFunction(() => document.getElementById('player').getAttribute('src')?.startsWith('blob:'));
    assert.equal(await page.locator('#start').isEnabled(), true);
  }
  assert.ok(requests.every(url => url.startsWith('http://127.0.0.1:4176/') || url.startsWith('blob:')), 'no external requests');
  console.log(`PASS ${engine}: isolated iPhone QA page, CSP blocks API requests, local WAV playback/clear/empty file${engine === 'chromium' ? ', fake-device record/pause/resume/stop' : '; physical Safari mic remains manual'}`);
} finally { await browser?.close(); await server.close(); }
