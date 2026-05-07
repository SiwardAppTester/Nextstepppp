-- Finance feature: bank accounts, statements, and transactions.
-- bank_accounts is used in Phase 1 (settings UI). statements + transactions
-- are defined here but only populated from Phase 3 onward (CSV upload flow).
-- Run this in Supabase SQL Editor.

-- =========================================================================
-- TABLES
-- =========================================================================

create table if not exists public.bank_accounts (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  iban         text not null,
  nickname     text not null,
  description  text,
  bank_name    text,
  color        text not null default '#4DA8FF',
  currency     text not null default 'EUR',
  created_at   timestamptz not null default now(),
  unique (user_id, iban)
);

create table if not exists public.statements (
  id                 uuid primary key default uuid_generate_v4(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  account_id         uuid not null references public.bank_accounts(id) on delete cascade,
  filename           text,
  period_start       date,
  period_end         date,
  transaction_count  int not null default 0,
  uploaded_at        timestamptz not null default now()
);

create table if not exists public.transactions (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  statement_id        uuid not null references public.statements(id) on delete cascade,
  account_id          uuid not null references public.bank_accounts(id) on delete cascade,
  txn_date            date not null,
  amount              numeric(12,2) not null,        -- signed: negative = expense
  direction           text not null check (direction in ('in','out')),
  raw_counterparty    text,
  clean_counterparty  text,
  counterparty_iban   text,
  description         text,
  bank_code           text,
  pocket              text,                          -- AI-assigned spending bucket
  is_recurring        boolean not null default false,
  ai_confidence       numeric(3,2),
  balance_after       numeric(12,2),
  created_at          timestamptz not null default now()
);

-- =========================================================================
-- INDEXES
-- =========================================================================

create index if not exists bank_accounts_user_idx        on public.bank_accounts (user_id);
create index if not exists statements_account_idx       on public.statements (account_id, period_start desc);
create index if not exists transactions_account_date_idx on public.transactions (account_id, txn_date desc);
create index if not exists transactions_statement_idx    on public.transactions (statement_id);
create index if not exists transactions_pocket_idx       on public.transactions (user_id, pocket, txn_date desc);

-- =========================================================================
-- ROW LEVEL SECURITY
-- =========================================================================

alter table public.bank_accounts enable row level security;
alter table public.statements    enable row level security;
alter table public.transactions  enable row level security;

create policy "owner all bank_accounts" on public.bank_accounts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "owner all statements" on public.statements
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "owner all transactions" on public.transactions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
