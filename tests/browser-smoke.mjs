import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.ZANG_BASE_URL || 'http://127.0.0.1:4173';
const locales = [
  {
    code: 'ru', title: 'Войдите в аккаунт', error: 'Неверный email или пароль.', navRecord: 'Запись', recordTitle: 'Новая запись', startAria: 'Начать запись', micDenied: 'Нет доступа к микрофону.',
    forgot: 'Забыли пароль?', resetButton: 'Отправить ссылку',
    resetSuccess: 'Если адрес зарегистрирован, на него отправлена ссылка для сброса пароля.',
    hasAccount: 'Уже есть аккаунт? Войти', noAccount: 'Нет аккаунта? Зарегистрироваться',
    registerButton: 'Зарегистрироваться', confirmation: 'Проверьте почту и подтвердите адрес, чтобы войти.',
  },
  {
    code: 'en', title: 'Sign in to your account', error: 'Incorrect email or password.', navRecord: 'Record', recordTitle: 'New recording', startAria: 'Start recording', micDenied: 'No microphone access.',
    forgot: 'Forgot password?', resetButton: 'Send reset link',
    resetSuccess: 'If this email is registered, a password reset link has been sent.',
    hasAccount: 'Already have an account? Sign in', noAccount: 'No account? Sign up',
    registerButton: 'Sign up', confirmation: 'Check your email and confirm your address to sign in.',
  },
  {
    code: 'az', title: 'Hesaba daxil olun', error: 'E-poçt və ya şifrə yanlışdır.', navRecord: 'Yazı', recordTitle: 'Yeni yazı', startAria: 'Yazıya başla', micDenied: 'Mikrofona giriş yoxdur.',
    forgot: 'Şifrənizi unutmusunuz?', resetButton: 'Bərpa linkini göndər',
    resetSuccess: 'Ünvan qeydiyyatlıdırsa, şifrənin bərpası linki e-poçta göndərildi.',
    hasAccount: 'Artıq hesabınız var? Daxil olun', noAccount: 'Hesabınız yoxdur? Qeydiyyatdan keçin',
    registerButton: 'Qeydiyyat', confirmation: 'Daxil olmaq üçün e-poçtunuzu təsdiqləyin.',
  },
  {
    code: 'tr', title: 'Hesabınıza giriş yapın', error: 'E-posta veya şifre yanlış.', navRecord: 'Kayıt', recordTitle: 'Yeni kayıt', startAria: 'Kaydı başlat', micDenied: 'Mikrofon erişimi yok.',
    forgot: 'Şifrenizi mi unuttunuz?', resetButton: 'Sıfırlama bağlantısı gönder',
    resetSuccess: 'E-posta kayıtlıysa parola sıfırlama bağlantısı gönderildi.',
    hasAccount: 'Zaten hesabınız var mı? Giriş yapın', noAccount: 'Hesabınız yok mu? Kayıt olun',
    registerButton: 'Kayıt ol', confirmation: 'Giriş yapmak için e-postanızı doğrulayın.',
  },
];

const mockUser = {
  id: '11111111-1111-4111-8111-111111111111',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'test-user@example.invalid',
  email_confirmed_at: null,
  phone: '',
  confirmed_at: null,
  last_sign_in_at: null,
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { full_name: 'Browser Test' },
  identities: [{
    identity_id: '22222222-2222-4222-8222-222222222222',
    id: '22222222-2222-4222-8222-222222222222',
    user_id: '11111111-1111-4111-8111-111111111111',
    identity_data: { email: 'test-user@example.invalid' },
    provider: 'email',
    last_sign_in_at: null,
    created_at: '2026-10-22T00:00:00Z',
    updated_at: '2026-10-22T00:00:00Z',
  }],
  created_at: '2026-10-22T00:00:00Z',
  updated_at: '2026-10-22T00:00:00Z',
};

const browser = await chromium.launch({ headless: true });
try {
  for (const locale of locales) {
    const page = await browser.newPage();
    await page.addInitScript((value) => localStorage.setItem('zenk-locale', value), locale.code);
    await page.route('**/auth/v1/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/token') && url.searchParams.get('grant_type') === 'password') {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'invalid_credentials', message: 'Invalid login credentials' }),
        });
        return;
      }
      if (url.pathname.endsWith('/recover')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        return;
      }
      if (url.pathname.endsWith('/signup')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockUser),
        });
        return;
      }
      await route.continue();
    });

    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('html').getAttribute('lang'), locale.code, `document language: ${locale.code}`);
    await page.getByText(locale.title, { exact: true }).waitFor({ state: 'visible' });

    await page.locator('input[type="email"]').fill('test-user@example.invalid');
    await page.locator('input[type="password"]').fill('not-a-real-password');
    await page.locator('button[type="submit"]').click();
    await page.getByRole('alert').waitFor({ state: 'visible' });
    assert.equal((await page.getByRole('alert').innerText()).trim(), locale.error, `localized login error: ${locale.code}`);

    await page.getByText(locale.forgot, { exact: true }).click();
    await page.locator('button[type="submit"]').click();
    await page.getByRole('status').waitFor({ state: 'visible' });
    assert.equal((await page.getByRole('status').innerText()).trim(), locale.resetSuccess, `localized password recovery: ${locale.code}`);

    await page.getByText(locale.hasAccount, { exact: true }).click();
    await page.getByText(locale.noAccount, { exact: true }).click();
    await page.locator('input[type="text"]').fill('Browser Test');
    await page.locator('input[type="email"]').fill('test-user@example.invalid');
    await page.locator('input[type="password"]').fill('not-a-real-password');
    await page.locator('button[type="submit"]').click();
    await page.getByRole('status').waitFor({ state: 'visible' });
    assert.equal((await page.getByRole('status').innerText()).trim(), locale.confirmation, `localized email confirmation: ${locale.code}`);

    await page.close();
    console.log(`PASS browser auth, recovery, and confirmation flows: ${locale.code}`);
  }

  // Check the recording screen and microphone-denial recovery in every supported locale.
  for (const locale of locales) {
    const page = await browser.newPage();
    await page.addInitScript((code) => {
      localStorage.setItem('zenk-locale', code);
      localStorage.setItem('zenk-onboarding-done', '1');
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: async () => { throw new DOMException('Permission denied', 'NotAllowedError'); } },
      });
    }, locale.code);
    await page.route('**/auth/v1/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/token') && url.searchParams.get('grant_type') === 'password') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            access_token: 'synthetic-access-token',
            token_type: 'bearer',
            expires_in: 3600,
            refresh_token: 'synthetic-refresh-token',
            user: mockUser,
          }),
        });
        return;
      }
      if (url.pathname.endsWith('/user')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockUser) });
        return;
      }
      await route.continue();
    });
    await page.route('**/rest/v1/**', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        return;
      }
      await route.fulfill({ status: 204, body: '' });
    });
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.locator('input[type="email"]').fill('test-user@example.invalid');
    await page.locator('input[type="password"]').fill('synthetic-password');
    await page.locator('button[type="submit"]').click();
    await page.getByText(locale.navRecord, { exact: true }).waitFor({ state: 'visible' });
    await page.getByText(locale.navRecord, { exact: true }).click();
    await page.getByText(locale.recordTitle, { exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: locale.startAria }).click();
    await page.getByRole('status').waitFor({ state: 'visible' });
    assert.equal((await page.getByRole('status').innerText()).trim(), locale.micDenied, `localized microphone denial: ${locale.code}`);
    await page.getByRole('button', { name: locale.startAria }).waitFor({ state: 'visible' });
    console.log(`PASS recording screen and microphone-denial recovery: ${locale.code}`);
    await page.close();
  }

  // End-to-end recording smoke test. All network responses and audio are synthetic;
  // this must never call a real Supabase project or a paid AI provider.
  const page = await browser.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('zenk-locale', 'en');
    localStorage.setItem('zenk-onboarding-done', '1');
    const tracks = [{ stop: () => { window.__zangTrackStopped = true; } }];
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => ({ getTracks: () => tracks }) },
    });
    class FakeMediaRecorder {
      static isTypeSupported() { return true; }
      constructor(_stream, options) {
        this.mimeType = options?.mimeType || 'audio/webm';
        this.state = 'inactive';
        this.ondataavailable = null;
        this.onstop = null;
      }
      start() { this.state = 'recording'; }
      pause() { this.state = 'paused'; }
      resume() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        this.ondataavailable?.({ data: new Blob(['synthetic audio bytes'], { type: this.mimeType }) });
        this.onstop?.();
      }
    }
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, writable: true, value: FakeMediaRecorder });
  });

  await page.route('**/auth/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/token') && url.searchParams.get('grant_type') === 'password') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'synthetic-access-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'synthetic-refresh-token',
          user: mockUser,
        }),
      });
      return;
    }
    if (url.pathname.endsWith('/user')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockUser) });
      return;
    }
    await route.continue();
  });
  await page.route('**/storage/v1/**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: 'recordings/synthetic/test.webm' }) });
      return;
    }
    await route.continue();
  });
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/meetings') && route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        headers: { 'content-range': '*/1', 'preference-applied': 'return=representation' },
        body: JSON.stringify({
          id: '33333333-3333-4333-8333-333333333333',
          user_id: mockUser.id,
          title: body.title,
          status: 'processing',
          audio_path: body.audio_path,
          created_at: '2026-10-22T00:00:00Z',
          summary: null,
          transcript: null,
        }),
      });
      return;
    }
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    await route.fulfill({ status: 204, body: '' });
  });
  await page.route('**/functions/v1/process-meeting', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        meeting: {
          id: '33333333-3333-4333-8333-333333333333',
          user_id: mockUser.id,
          title: 'New meeting',
          status: 'ready',
          summary: 'Synthetic protocol: agree the next steps.',
          transcript: 'Synthetic transcript',
          created_at: '2026-10-22T00:00:00Z',
        },
        tasks: [{
          id: '44444444-4444-4444-8444-444444444444',
          meeting_id: '33333333-3333-4333-8333-333333333333',
          user_id: mockUser.id,
          title: 'Send the proposal',
          assignee: 'Browser Test',
          due_date: '2026-10-23',
          completed: false,
        }],
      }),
    });
  });

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('input[type="email"]').fill('test-user@example.invalid');
  await page.locator('input[type="password"]').fill('synthetic-password');
  await page.locator('button[type="submit"]').click();
  await page.getByText('Record', { exact: true }).waitFor({ state: 'visible' });
  await page.getByText('Record', { exact: true }).click();
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.getByRole('button', { name: 'Stop recording' }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await page.getByText('Synthetic protocol: agree the next steps.', { exact: true }).waitFor({ state: 'visible' });
  await page.getByText('Send the proposal', { exact: true }).waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => window.__zangTrackStopped === true), true, 'microphone track must be released after stop');
  console.log('PASS mocked browser recording → meeting detail → task rendering and microphone cleanup');
  await page.close();
} finally {
  await browser.close();
}
