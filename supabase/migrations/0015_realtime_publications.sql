-- Add tables to the supabase_realtime publication so the browser can listen
-- for INSERT/UPDATE/DELETE on the user's data and refresh the UI when the
-- Coach mutates state from another surface (e.g. Telegram).
--
-- Idempotent: skips tables already in the publication so re-runs are safe.
-- Run this in Supabase SQL Editor.

do $$
declare
  t text;
  tables text[] := array[
    'tasks',
    'events',
    'goals',
    'categories',
    'wishlist_items'
  ];
begin
  foreach t in array tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
