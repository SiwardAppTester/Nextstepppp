-- Rental checks: per-account rules that say "expect EXPECTED_AMOUNT every
-- month from COUNTERPARTY_IBAN". Status (paid / partial / missing) is
-- computed live from the transactions table — no per-month rows stored.
-- Run this in Supabase SQL Editor.

create table if not exists public.rental_checks (
  id                 uuid primary key default uuid_generate_v4(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  account_id         uuid not null references public.bank_accounts(id) on delete cascade,
  name               text not null,
  expected_amount    numeric(12,2) not null check (expected_amount > 0),
  counterparty_iban  text not null,
  notes              text,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now()
);

create index if not exists rental_checks_account_idx
  on public.rental_checks (account_id) where is_active = true;

alter table public.rental_checks enable row level security;

create policy "owner all rental_checks" on public.rental_checks
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
