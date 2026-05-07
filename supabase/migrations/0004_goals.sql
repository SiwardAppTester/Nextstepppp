-- Add goals as first-class objects within a category, plus optional links
-- from tasks and events back to the goal they serve.
--
-- Run this in Supabase SQL Editor.

create table if not exists public.goals (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  category_id   uuid not null references public.categories(id) on delete cascade,
  title         text not null,
  description   text,
  target_date   timestamptz,
  status        text not null default 'active'
                check (status in ('active','done','archived')),
  completed_at  timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists goals_user_status_idx   on public.goals (user_id, status);
create index if not exists goals_category_idx      on public.goals (category_id);

alter table public.goals enable row level security;

create policy "owner all goals" on public.goals
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Link tasks and events to a goal (optional). On goal delete, null out so the
-- task/event survives but loses the link.
alter table public.tasks
  add column if not exists goal_id uuid references public.goals(id) on delete set null;

alter table public.events
  add column if not exists goal_id uuid references public.goals(id) on delete set null;

create index if not exists tasks_goal_idx  on public.tasks (goal_id);
create index if not exists events_goal_idx on public.events (goal_id);
