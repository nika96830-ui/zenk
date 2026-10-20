create extension if not exists "uuid-ossp";

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  avatar_url text,
  push_token text,
  plan text default 'free',
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  created_at timestamp with time zone default timezone('utc'::text, now())
);
alter table public.profiles enable row level security;
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can view own profile" on public.profiles for select using ((select auth.uid()) = id);
create policy "Users can update own profile" on public.profiles for update using ((select auth.uid()) = id);
create policy "Users can insert own profile" on public.profiles for insert with check ((select auth.uid()) = id);

create table if not exists public.meetings (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null default 'Untitled meeting',
  status text not null default 'processing',
  audio_path text,
  duration text default '',
  transcript text,
  summary text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);
alter table public.meetings enable row level security;
drop policy if exists "Users can view own meetings" on public.meetings;
drop policy if exists "Users can insert own meetings" on public.meetings;
drop policy if exists "Users can update own meetings" on public.meetings;
drop policy if exists "Users can delete own meetings" on public.meetings;
create policy "Users can view own meetings" on public.meetings for select using ((select auth.uid()) = user_id);
create policy "Users can insert own meetings" on public.meetings for insert with check ((select auth.uid()) = user_id);
create policy "Users can update own meetings" on public.meetings for update using ((select auth.uid()) = user_id);
create policy "Users can delete own meetings" on public.meetings for delete using ((select auth.uid()) = user_id);

create table if not exists public.tasks (
  id uuid default uuid_generate_v4() primary key,
  meeting_id uuid references public.meetings(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  assignee text,
  due_date text,
  completed boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.tasks enable row level security;
drop policy if exists "Users manage own tasks" on public.tasks;
create policy "Users manage own tasks" on public.tasks for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users can upload own recordings" on storage.objects;
drop policy if exists "Users can read own recordings" on storage.objects;
drop policy if exists "Users can delete own recordings" on storage.objects;
create policy "Users can upload own recordings" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users can read own recordings" on storage.objects
  for select to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users can delete own recordings" on storage.objects
  for delete to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);
