-- Pocket groups: a parent category each pocket belongs to (e.g. "Bills &
-- utilities", "Property income"). Stored as a plain text field rather than a
-- separate table — groups are AI-managed, low-cardinality, and don't need
-- their own identity yet.
-- Existing pockets get NULL until the AI backfills them on the next
-- re-categorize run (server reads pocket_group_updates from the AI response).
-- Run this in Supabase SQL Editor.

alter table public.finance_pockets
  add column if not exists group_name text;

create index if not exists finance_pockets_group_idx
  on public.finance_pockets (user_id, group_name)
  where is_archived = false;
