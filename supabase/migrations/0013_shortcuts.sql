-- Sidebar shortcuts: user-defined links to external websites that show up in
-- the app sidebar (e.g. GitHub, Linear, Notion). Managed from Settings.
-- Run this in Supabase SQL Editor.

create table if not exists public.shortcuts (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  label       text not null,
  url         text not null,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists shortcuts_user_idx
  on public.shortcuts (user_id, position, created_at);

alter table public.shortcuts enable row level security;

create policy "owner all shortcuts" on public.shortcuts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
