-- Optional: tighten the task status CHECK constraint to match the simplified
-- UI (just 'todo' and 'done'). Run this in Supabase SQL Editor whenever you
-- want the DB schema to match the code shape — not required for the app to
-- function (the UI no longer creates 'doing' or 'blocked' rows anyway).
--
-- This migration is idempotent: dropping a non-existent constraint is a no-op,
-- and the UPDATE is safe to re-run.

-- 1. Reset any legacy rows back to 'todo'.
update public.tasks set status = 'todo' where status in ('doing', 'blocked');

-- 2. Replace the CHECK constraint.
alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks
  add constraint tasks_status_check check (status in ('todo', 'done'));
