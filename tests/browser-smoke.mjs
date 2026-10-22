import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.ZANG_BASE_URL || 'http://127.0.0.1:4173';
const locales = [
  { code: 'ru', title: 'Войдите в аккаунт', error: 'Неверный email или пароль.' },
  { code: 'en', title: 'Sign in to your account', error: 'Incorrect email or password.' },
  { code: 'az', title: 'Hesaba daxil olun', error: 'E-poçt və ya şifrə yanlışdır.' },
  { code: 'tr', title: 'Hesabınıza giriş yapın', error: 'E-posta veya şifre yanlış.' },
];

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
    await page.close();
    console.log(`PASS browser auth error localization: ${locale.code}`);
  }
} finally {
  await browser.close();
}
