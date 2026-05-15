-- Extends events with fields needed to mirror events from external calendars
-- (currently: Google Calendar via the gmail_accounts table — same OAuth grant,
-- now scoped for calendar.readonly too).
--
-- Imported events are read-only in the app. They live alongside native events
-- so the Coach + calendar view see one unified stream. Native events have all
-- external_* columns null.
--
-- Run this in Supabase SQL Editor.

alter table public.events
  add column if not exists external_source       text,
  add column if not exists external_account_id   uuid references public.gmail_accounts(id) on delete cascade,
  add column if not exists external_calendar_id  text,
  add column if not exists external_id           text,
  add column if not exists external_etag         text,
  add column if not exists external_html_link    text,
  add column if not exists last_synced_at        timestamptz;

-- Unique key for upserts. We use a partial index so native events (where
-- external_* is null) aren't constrained — only imported rows are deduped.
create unique index if not exists events_external_key_idx
  on public.events (external_account_id, external_calendar_id, external_id)
  where external_id is not null;

-- Speed up "events for window" queries that also filter by source.
create index if not exists events_external_source_idx
  on public.events (user_id, external_source, start_at)
  where external_source is not null;

-- Track sync state per (account, calendar). syncToken lets us pull only
-- deltas after the first full window load — much cheaper than re-fetching.
create table if not exists public.google_calendar_sync_state (
  account_id      uuid not null references public.gmail_accounts(id) on delete cascade,
  calendar_id     text not null,
  sync_token      text,
  last_synced_at  timestamptz,
  last_sync_error text,
  primary key (account_id, calendar_id)
);

alter table public.google_calendar_sync_state enable row level security;

-- RLS via the parent gmail_accounts row.
create policy "owner all google_calendar_sync_state" on public.google_calendar_sync_state
  for all using (
    exists (
      select 1 from public.gmail_accounts ga
      where ga.id = google_calendar_sync_state.account_id
        and ga.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.gmail_accounts ga
      where ga.id = google_calendar_sync_state.account_id
        and ga.user_id = auth.uid()
    )
  );

-- Track which scopes we've been granted per account. Existing rows are
-- assumed to have only gmail.metadata. When a user re-consents with calendar
-- access, we update this so we know it's safe to call the Calendar API.
alter table public.gmail_accounts
  add column if not exists granted_scopes text;
