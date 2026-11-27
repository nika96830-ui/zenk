# Тестовые подписки ZANG

Платёжный интерфейс доступен на [тестовом сайте ZANG](https://zenk-git-fix-zang-stripe-sandbox-zangui.vercel.app/settings). Для ветки `fix/zang-stripe-sandbox` переменные Preview указывают на `zang-test`. Checkout принимает только запросы тестового сайта, а функции принимают ключи Stripe только из тестовой среды и проверяют аккаунт `ZANG sandbox`.

| Тариф | Тестовая цена | Период |
| --- | --- | --- |
| Freelance | $1 | Месяц |
| Team | $2 | Месяц |

Для работы тестового сайта нужны два значения в [Edge Function Secrets проекта zang-test](https://supabase.com/dashboard/project/ipozahulbphrgvzoikss/functions/secrets):

- `STRIPE_SANDBOX_KEY` — новый ограниченный ключ Stripe из `ZANG sandbox`. Нужны права читать данные аккаунта и подписки, создавать клиентов и сессии Checkout и открывать Customer Portal.
- `STRIPE_SANDBOX_WEBHOOK_SECRET` — signing secret тестового endpoint `stripe-sandbox-webhook` в Stripe Workbench.

Тестовый сценарий начинается в **Настройках** под тестовым аккаунтом ZANG. После оплаты Stripe отправляет подписанные события, а ZANG сверяет актуальный статус подписки и обновляет тариф в профиле. Отмена в Customer Portal возвращает профиль к Free. Повторные уведомления учитываются один раз. Проверить можно с [тестовой картой Stripe](https://docs.stripe.com/testing).

Файл [stripe_billing.sql](../supabase/sandbox/stripe_billing.sql) предназначен для `zang-test`, где уже есть серверная функция `apply_subscription_event`. Для коммерческого выпуска отдельно проверяются активация Stripe, цены и Stripe Tax, а также обработка возвратов, споров и предупреждений о мошенничестве.
