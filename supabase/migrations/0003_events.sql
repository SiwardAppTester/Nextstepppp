-- Add events table for time-anchored items (meetings, workouts, appointments).
-- Tasks are TODO items (lifecycle: todo → done). Events are things that HAPPEN
-- at a specific moment in time.
--
-- Run this in Supabase SQL Editor.

create table if not exists public.events (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  category_id     uuid references public.categories(id) on delete set null,
  title           text not null,
  description     text,
  location        text,
  start_at        timestamptz not null,
  end_at          timestamptz,
  all_day         boolean not null default false,
  recurring       text,
  reminder_sent   boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists events_user_start_idx on public.events (user_id, start_at);
create index if not exists events_category_idx   on public.events (category_id);

alter table public.events enable row level security;

create policy "owner all events" on public.events
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
