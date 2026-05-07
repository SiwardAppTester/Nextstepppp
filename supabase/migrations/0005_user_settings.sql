-- Per-user preferences for chatbot behavior.
-- Run this in Supabase SQL Editor.

create table if not exists public.user_settings (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  auto_confirm boolean not null default false,
  updated_at   timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "owner all user_settings" on public.user_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
