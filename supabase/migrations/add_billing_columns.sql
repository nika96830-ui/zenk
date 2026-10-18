-- Billing fields on profiles (run in SQL Editor if columns missing)
alter table public.profiles
  add column if not exists plan text default 'free',
  add column if not exists stripe_customer_id text;
