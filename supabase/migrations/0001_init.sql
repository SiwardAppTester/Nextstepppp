-- Nextsteppp initial schema
-- Run order: extensions → tables → indexes → RLS → policies → seed function

create extension if not exists "uuid-ossp";
create extension if not exists "vector";

-- =========================================================================
-- TABLES
-- =========================================================================

create table if not exists public.categories (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#4DA8FF',
  icon text not null default 'Tag',
  context text,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo','doing','done','blocked')),
  priority int not null default 3 check (priority between 1 and 5),
  due_date timestamptz,
  scheduled_for timestamptz,
  recurring text,
  reminder_sent boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  started_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','tool','system')),
  content jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.memory (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  content text not null,
  embedding vector(1024), -- voyage-3 = 1024 dims
  importance int not null default 3 check (importance between 1 and 5),
  created_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- INDEXES
-- =========================================================================

create index if not exists tasks_user_status_idx on public.tasks (user_id, status);
create index if not exists tasks_scheduled_idx on public.tasks (scheduled_for) where reminder_sent = false;
create index if not exists tasks_due_idx on public.tasks (due_date);
create index if not exists messages_conv_idx on public.messages (conversation_id, created_at);
create index if not exists conversations_user_idx on public.conversations (user_id, last_message_at desc);
create index if not exists memory_user_idx on public.memory (user_id);

-- pgvector index for cosine similarity search.
-- ivfflat needs ANALYZE after data is loaded; lists tuned later.
create index if not exists memory_embedding_idx
  on public.memory using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- =========================================================================
-- ROW LEVEL SECURITY
-- =========================================================================

alter table public.categories enable row level security;
alter table public.tasks enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.memory enable row level security;
alter table public.push_subscriptions enable row level security;

-- Owner-only policies. Belt + suspenders behind the API-layer email gate.
create policy "owner all categories" on public.categories
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "owner all tasks" on public.tasks
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "owner all conversations" on public.conversations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Messages are owned via their conversation.
create policy "owner all messages" on public.messages
  for all using (
    exists (select 1 from public.conversations c where c.id = messages.conversation_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.conversations c where c.id = messages.conversation_id and c.user_id = auth.uid())
  );

create policy "owner all memory" on public.memory
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "owner all push" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =========================================================================
-- SEED DEFAULT CATEGORIES — run on first sign-in for the owner
-- =========================================================================

create or replace function public.seed_default_categories(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.categories where user_id = p_user_id) then
    insert into public.categories (user_id, name, color, icon, context) values
      (p_user_id, 'Personal',   '#4DA8FF', 'User',      'Personal life, errands, family.'),
      (p_user_id, 'Home',       '#7C82FF', 'Home',      'Apartment, maintenance, household.'),
      (p_user_id, 'Business 1', '#00D4B8', 'Briefcase', 'Primary business venture.'),
      (p_user_id, 'Business 2', '#FF8E4D', 'Rocket',    'Side venture — SaaS in development.'),
      (p_user_id, 'Gym',        '#F2545B', 'Dumbbell',  'Strength training, mobility, cardio.');
  end if;
end;
$$;

-- =========================================================================
-- VECTOR SEARCH HELPER — used by the Coach's `search_memory` tool
-- =========================================================================

create or replace function public.search_memory(
  p_user_id uuid,
  p_query_embedding vector(1024),
  p_match_threshold float default 0.75,
  p_match_count int default 5
)
returns table (
  id uuid,
  content text,
  importance int,
  similarity float
)
language sql
stable
as $$
  select
    m.id,
    m.content,
    m.importance,
    1 - (m.embedding <=> p_query_embedding) as similarity
  from public.memory m
  where m.user_id = p_user_id
    and m.embedding is not null
    and 1 - (m.embedding <=> p_query_embedding) > p_match_threshold
  order by m.embedding <=> p_query_embedding
  limit p_match_count
$$;
