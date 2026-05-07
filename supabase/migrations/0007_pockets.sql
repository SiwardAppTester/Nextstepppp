-- Pockets are AI-generated spending/income buckets, per-user. The list grows
-- organically as the AI categorizes statements: it tries existing pockets
-- first and only creates a new one when nothing fits.
-- Replaces the unused `pocket text` column on transactions with a real FK.
-- Run this in Supabase SQL Editor.

create table if not exists public.finance_pockets (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  description text,
  color       text not null default '#4DA8FF',
  is_archived boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists finance_pockets_user_idx
  on public.finance_pockets (user_id) where is_archived = false;

-- Drop the placeholder text column from 0006 and replace with a real FK.
drop index if exists transactions_pocket_idx;
alter table public.transactions drop column if exists pocket;
alter table public.transactions
  add column if not exists pocket_id uuid references public.finance_pockets(id) on delete set null;

create index if not exists transactions_pocket_id_idx
  on public.transactions (user_id, pocket_id, txn_date desc);

alter table public.finance_pockets enable row level security;

create policy "owner all finance_pockets" on public.finance_pockets
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
