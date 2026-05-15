-- Replace the partial unique index on external_* with a full one.
--
-- The previous index used WHERE external_id IS NOT NULL so it wouldn't
-- constrain native events. Problem: PostgreSQL's ON CONFLICT requires the
-- same predicate to be specified, and Supabase's upsert API doesn't expose
-- it. So every calendar-sync upsert failed with 42P10.
--
-- Non-partial works too: PostgreSQL treats NULL != NULL in unique indexes
-- by default, so native events (all NULL) don't conflict with each other.
--
-- Run this in Supabase SQL Editor.

drop index if exists public.events_external_key_idx;

create unique index if not exists events_external_key_idx
  on public.events (external_account_id, external_calendar_id, external_id);
