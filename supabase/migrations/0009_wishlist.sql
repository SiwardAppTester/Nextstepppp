-- Wishlist: things the user wants to buy later. Items are added either from
-- the chat (AI tool create_wishlist_item) or directly on the wishlist page.
-- status='open' is active, 'bought' is purchased, 'discarded' is dropped.
-- Run this in Supabase SQL Editor.

create table if not exists public.wishlist_items (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  url         text,
  price       numeric(12,2),
  notes       text,
  status      text not null default 'open' check (status in ('open', 'bought', 'discarded')),
  bought_at   timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists wishlist_items_user_idx
  on public.wishlist_items (user_id, status, created_at desc);

alter table public.wishlist_items enable row level security;

create policy "owner all wishlist_items" on public.wishlist_items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
