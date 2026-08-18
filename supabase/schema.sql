-- SOCIA database schema
-- Run this in your Supabase project: Dashboard → SQL Editor → New query → paste → Run.

-- Saved content plans: one row per generated deliverable, owned by a user.
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_handle text,
  niche text,
  platform text,
  data jsonb not null,
  created_at timestamptz not null default now()
);

-- Row Level Security: every user can only ever touch their own rows.
alter table public.plans enable row level security;

create policy "Users can read their own plans"
  on public.plans for select
  using (auth.uid() = user_id);

create policy "Users can insert their own plans"
  on public.plans for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own plans"
  on public.plans for delete
  using (auth.uid() = user_id);

-- Fast lookups of a user's plans, newest first.
create index if not exists plans_user_created_idx
  on public.plans (user_id, created_at desc);

-- User profile: niche, brand, goals, and whether a social account is connected.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  niche text,
  brand_name text,
  goals text,
  platforms text[],
  account_connected boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can read their own profile"
  on public.profiles for select
  using (auth.uid() = user_id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Shared cache of "what's working" per niche (generated once, reused by everyone
-- in that niche — keeps the AI cost low and the page instant).
create table if not exists public.niche_trends (
  niche text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.niche_trends enable row level security;

create policy "Signed-in users can read niche trends"
  on public.niche_trends for select
  using (auth.role() = 'authenticated');

create policy "Signed-in users can add niche trends"
  on public.niche_trends for insert
  with check (auth.role() = 'authenticated');

create policy "Signed-in users can update niche trends"
  on public.niche_trends for update
  using (auth.role() = 'authenticated');

-- Saved AI Strategist chat conversations, one row per conversation.
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  messages jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.conversations enable row level security;

create policy "Users can read their own conversations"
  on public.conversations for select using (auth.uid() = user_id);
create policy "Users can insert their own conversations"
  on public.conversations for insert with check (auth.uid() = user_id);
create policy "Users can update their own conversations"
  on public.conversations for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their own conversations"
  on public.conversations for delete using (auth.uid() = user_id);

create index if not exists conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc);

-- A user's connected Instagram account + the long-lived access token we use to
-- pull their real posts and insights. One row per user (their primary IG).
create table if not exists public.instagram_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  ig_user_id text,
  username text,
  account_type text,
  access_token text not null,
  token_expires_at timestamptz,
  connected_at timestamptz not null default now()
);

alter table public.instagram_connections enable row level security;

create policy "Users can read their own instagram connection"
  on public.instagram_connections for select using (auth.uid() = user_id);
create policy "Users can insert their own instagram connection"
  on public.instagram_connections for insert with check (auth.uid() = user_id);
create policy "Users can update their own instagram connection"
  on public.instagram_connections for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their own instagram connection"
  on public.instagram_connections for delete using (auth.uid() = user_id);
