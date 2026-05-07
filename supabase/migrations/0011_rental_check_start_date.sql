-- Add a start date to rental checks so months before the payment plan
-- started don't show as "missing". Status logic ignores months earlier than
-- start_date's month and returns a "not started" state instead.
-- Nullable so existing rows continue to work; new rows are required from the
-- form. Run this in Supabase SQL Editor.

alter table public.rental_checks
  add column if not exists start_date date;
