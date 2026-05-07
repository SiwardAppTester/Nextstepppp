-- Multiple Gmail accounts per user, read-only. We poll Gmail for the inbox
-- unread count and cache it here so the sidebar stays snappy. Refresh tokens
-- are AES-256-GCM encrypted at the app layer (key in GMAIL_TOKEN_ENCRYPTION_KEY)
-- on top of RLS, so a DB dump alone doesn't expose them.
-- Run this in Supabase SQL Editor.

create table if not exists public.gmail_accounts (
  id                          uuid primary key default uuid_generate_v4(),
  user_id                     uuid not null references auth.users(id) on delete cascade,
  email                       text not null,
  google_user_id              text not null,
  encrypted_refresh_token     text not null,
  encrypted_access_token      text,
  access_token_expires_at     timestamptz,
  unread_count                integer not null default 0,
  last_synced_at              timestamptz,
  last_sync_error             text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (user_id, google_user_id)
);

create index if not exists gmail_accounts_user_idx
  on public.gmail_accounts (user_id, created_at);

alter table public.gmail_accounts enable row level security;

create policy "owner all gmail_accounts" on public.gmail_accounts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
