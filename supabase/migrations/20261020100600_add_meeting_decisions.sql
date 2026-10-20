alter table public.meetings
  add column if not exists decisions text not null default '';
