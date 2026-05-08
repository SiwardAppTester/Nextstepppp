-- Telegram bridge config. Single-user app, so this table holds at most one
-- row per user — the Telegram chat ID we'll talk to. We pin it on the first
-- inbound message from Telegram (since `.env.local` isn't writeable on Vercel
-- at runtime, env-pinning isn't an option).
-- Run this in Supabase SQL Editor.

create table if not exists public.telegram_config (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  chat_id     bigint not null,
  username    text,
  pinned_at   timestamptz not null default now()
);

alter table public.telegram_config enable row level security;

create policy "owner all telegram_config" on public.telegram_config
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
