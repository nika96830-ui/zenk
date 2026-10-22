import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.ZANG_BASE_URL || 'http://127.0.0.1:4173';
const locales = [
  {
    code: 'ru', title: 'Войдите в аккаунт', error: 'Неверный email или пароль.',
    forgot: 'Забыли пароль?', resetButton: 'Отправить ссылку',
    resetSuccess: 'Если адрес зарегистрирован, на него отправлена ссылка для сброса пароля.',
    hasAccount: 'Уже есть аккаунт? Войти', noAccount: 'Нет аккаунта? Зарегистрироваться',
    registerButton: 'Зарегистрироваться', confirmation: 'Проверьте почту и подтвердите адрес, чтобы войти.',
  },
  {
    code: 'en', title: 'Sign in to your account', error: 'Incorrect email or password.',
    forgot: 'Forgot password?', resetButton: 'Send reset link',
    resetSuccess: 'If this email is registered, a password reset link has been sent.',
    hasAccount: 'Already have an account? Sign in', noAccount: 'No account? Sign up',
    registerButton: 'Sign up', confirmation: 'Check your email and confirm your address to sign in.',
  },
  {
    code: 'az', title: 'Hesaba daxil olun', error: 'E-poçt və ya şifrə yanlışdır.',
    forgot: 'Şifrənizi unutmusunuz?', resetButton: 'Bərpa linkini göndər',
    resetSuccess: 'Ünvan qeydiyyatlıdırsa, şifrənin bərpası linki e-poçta göndərildi.',
    hasAccount: 'Artıq hesabınız var? Daxil olun', noAccount: 'Hesabınız yoxdur? Qeydiyyatdan keçin',
    registerButton: 'Qeydiyyat', confirmation: 'Daxil olmaq üçün e-poçtunuzu təsdiqləyin.',
  },
  {
    code: 'tr', title: 'Hesabınıza giriş yapın', error: 'E-posta veya şifre yanlış.',
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
          body: JSON.stringify({ user: mockUser, session: null }),
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
} finally {
  await browser.close();
}
