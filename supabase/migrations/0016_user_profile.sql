-- Cross-cutting user profile blurb — facts that span all categories
-- (preferences, work style, values, key people across the user's life,
-- recurring habits, ambitions that span categories). The Coach reads it
-- on every turn via <user_context> and updates it through the
-- update_user_profile tool, same auto-save rules as category context.
--
-- Run this in Supabase SQL Editor.

alter table public.user_settings
  add column if not exists profile text;
