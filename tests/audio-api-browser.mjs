// Real supabase-js over mocked HTTP. No hosted data or paid AI requests.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium, webkit } from 'playwright';
const engine = process.env.ZANG_BROWSER || 'chromium';
const server = await createServer({ server: { host: '127.0.0.1', port: 4175, strictPort: true } });
await server.listen();
let browser;
try {
  browser = await ({ chromium, webkit })[engine].launch({ headless: true });
  const page = await browser.newPage();
  const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'qa@example.invalid' };
  let failure = null;
  let uploads = [];
  let failedUpdates = 0;
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.hostname !== 'placeholder.supabase.co') return route.abort();
    let body = {};
    let status = 200;
    if (url.pathname.endsWith('/auth/v1/token')) body = { user, access_token: 'synthetic', refresh_token: 'synthetic', expires_in: 3600, token_type: 'bearer' };
    else if (url.pathname.endsWith('/auth/v1/user')) body = user;
    else if (url.pathname.startsWith('/storage/v1/object/recordings/')) {
      uploads.push({ path: url.pathname, type: req.headers()['content-type'], body: req.postData() });
      body = { Key: url.pathname };
    } else if (url.pathname.endsWith('/rest/v1/meetings')) {
      if (req.method() === 'POST') body = { ...req.postDataJSON(), id: '33333333-3333-4333-8333-333333333333', created_at: new Date().toISOString() };
      else if (req.method() === 'PATCH') { failedUpdates++; body = []; }
      else body = [];
    } else if (url.pathname.endsWith('/functions/v1/process-meeting')) {
      status = failure?.status || 200;
      body = failure?.body ?? { meeting: { id: '33333333-3333-4333-8333-333333333333', title: 'Mock meeting', status: 'completed', summary: 'Mock summary', created_at: new Date().toISOString() }, tasks: [] };
    } else if (url.pathname.endsWith('/rest/v1/tasks') || url.pathname.endsWith('/rest/v1/profiles')) body = [];
    else throw new Error(`Unexpected mocked request ${req.method()} ${url.pathname}`);
    await route.fulfill({ status, contentType: 'application/json', body: typeof body === 'string' ? body : JSON.stringify(body) });
  });
  await page.goto('http://127.0.0.1:4175');
  await page.evaluate(async () => {
    const { supabase } = await import('/src/lib/supabase.ts');
    await supabase.auth.signInWithPassword({ email: 'qa@example.invalid', password: 'synthetic' });
  });
  const processFile = (type, name = 'voice.M4A', size = 8) => page.evaluate(async ({ type, name, size }) => {
    const { processRecording } = await import('/src/services/ai.ts');
    try { const result = await processRecording(new File([new Uint8Array(size)], name, { type })); return result.meeting.title; }
    catch (e) { return e.message; }
  }, { type, name, size });
  for (const type of ['audio/mp4', 'audio/mp4;codecs=mp4a.40.2', 'audio/x-m4a', 'audio/m4a', '', 'application/octet-stream']) {
    assert.equal(await processFile(type), 'Mock meeting');
    assert.match(uploads.at(-1).path, /\/11111111-1111-4111-8111-111111111111\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.m4a$/);
    assert.ok(uploads.at(-1).type.includes('audio/mp4') || uploads.at(-1).body.includes('audio/mp4'));
  }
  assert.equal(new Set(uploads.map(upload => upload.path)).size, uploads.length, 'uploads receive collision-resistant unique paths');
  const before = uploads.length;
  assert.equal(await processFile('audio/mp4', 'empty.m4a', 0), 'UNSUPPORTED_AUDIO_TYPE');
  assert.equal(await processFile('text/plain'), 'UNSUPPORTED_AUDIO_TYPE');
  assert.equal(await processFile('', 'unknown.bin'), 'UNSUPPORTED_AUDIO_TYPE');
  assert.equal(await processFile('audio/mp4', 'large.m4a', 25 * 1024 * 1024 + 1), 'AUDIO_TOO_LARGE');
  assert.equal(uploads.length, before, 'invalid files rejected before upload');
  console.log(`PASS ${engine}: six M4A MIME variants and invalid/oversized file rejection (synthetic bytes)`);
  for (const [status, body, expected] of [
    [429, { error: 'Monthly meeting quota exceeded' }, 'MEETING_QUOTA_EXCEEDED'],
    [500, { error: 'insufficient_quota' }, 'AI_INSUFFICIENT_BALANCE'],
    [503, { error: 'OPENAI_API_KEY is not configured' }, 'AI_CONFIGURATION_ERROR'],
    [500, 'not JSON', 'PROCESS_FAILED'],
    [500, { error: 'private provider detail' }, 'PROCESS_FAILED'],
  ]) {
    failure = { status, body };
    assert.equal(await processFile('audio/mp4'), expected);
  }
  assert.equal(failedUpdates, 5);
  console.log(`PASS ${engine}: real FunctionsHttpError parsing, safe messages and failed status persistence`);
  // Exercise the browser's actual encoder and decoder with a generated tone.
  // This is not a microphone, speech-recognition, Safari-device or physical-iPhone test.
  const codec = await page.evaluate(async () => {
    if (typeof MediaRecorder === 'undefined') return { unsupported: true };
    const context = new AudioContext();
    const tone = context.createOscillator(), destination = context.createMediaStreamDestination();
    tone.connect(destination); tone.start(); await context.resume();
    const mime = ['audio/mp4', 'audio/webm;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
    if (!mime) throw new Error('No supported test codec');
    const recorder = new MediaRecorder(destination.stream, { mimeType: mime });
    const chunks = [];
    recorder.ondataavailable = e => chunks.push(e.data);
    const stopped = new Promise(resolve => recorder.onstop = resolve);
    recorder.start(); await new Promise(resolve => setTimeout(resolve, 250)); recorder.stop(); await stopped;
    const blob = new Blob(chunks, { type: recorder.mimeType });
    tone.stop(); destination.stream.getTracks().forEach(track => track.stop()); await context.close();
    const url = URL.createObjectURL(blob), audio = new Audio(url);
    try {
      await audio.play();
      await new Promise((resolve, reject) => { audio.onended = resolve; audio.onerror = reject; setTimeout(() => reject(new Error('playback timeout')), 5000); });
      return { mime: recorder.mimeType, bytes: blob.size };
    } finally { audio.pause(); URL.revokeObjectURL(url); }
  });
  if (codec.unsupported) {
    assert.equal(engine, 'webkit', 'Chromium codec coverage must remain available');
    console.log('SKIP webkit native recording/playback: this Linux build has no MediaRecorder; physical Safari acceptance is still required');
  } else {
    assert.ok(codec.bytes > 0);
    console.log(`PASS ${engine}: actual browser encode → stop → decode/playback of generated tone (${codec.mime}, ${codec.bytes} bytes)`);
  }
} finally {
  await browser?.close();
  await server.close();
}
