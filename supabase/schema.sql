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

-- Synced snapshot of the connected account (profile + recent posts), refreshed
-- automatically on connect and whenever it goes stale.
alter table public.instagram_connections
  add column if not exists profile jsonb,
  add column if not exists media jsonb,
  add column if not exists followers_count integer,
  add column if not exists media_count integer,
  add column if not exists last_synced_at timestamptz;

-- Niche detection hierarchy (additive; the app degrades gracefully without these)
alter table public.profiles add column if not exists niche_detail jsonb;
alter table public.profiles add column if not exists niche_analyzed_at timestamptz;

-- Brand & strategist settings (additive; the app degrades gracefully without it)
alter table public.profiles add column if not exists brand_detail jsonb;

-- Daily follower snapshots — real history for the analytics follower trend.
-- One row per user per day, written best-effort whenever data is served.
create table if not exists public.account_snapshots (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  followers integer,
  primary key (user_id, day)
);

alter table public.account_snapshots enable row level security;

create policy "Users can read their own snapshots"
  on public.account_snapshots for select using (auth.uid() = user_id);

create policy "Users can add their own snapshots"
  on public.account_snapshots for insert with check (auth.uid() = user_id);

create policy "Users can update their own snapshots"
  on public.account_snapshots for update using (auth.uid() = user_id);

-- Extended daily account metrics (only values Meta actually provides are written)
alter table public.account_snapshots
  add column if not exists views integer,
  add column if not exists reach integer,
  add column if not exists profile_views integer,
  add column if not exists accounts_engaged integer,
  add column if not exists total_interactions integer,
  add column if not exists likes integer,
  add column if not exists comments integer,
  add column if not exists saves integer,
  add column if not exists shares integer,
  add column if not exists retrieved_at timestamptz;

-- Facebook Page connections (Facebook Login OAuth; one Page per user for now).
-- pending_pages holds the manager's Page list between OAuth and Page selection.
create table if not exists public.facebook_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  page_id text,
  page_name text,
  username text,
  access_token text,
  picture_url text,
  followers_count integer,
  profile jsonb,
  media jsonb,
  connection_status text default 'connected',
  pending_pages jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.facebook_connections enable row level security;

create policy "Users can read their own facebook connection"
  on public.facebook_connections for select using (auth.uid() = user_id);
create policy "Users can add their own facebook connection"
  on public.facebook_connections for insert with check (auth.uid() = user_id);
create policy "Users can update their own facebook connection"
  on public.facebook_connections for update using (auth.uid() = user_id);
create policy "Users can delete their own facebook connection"
  on public.facebook_connections for delete using (auth.uid() = user_id);

-- Daily new followers from Instagram insights (gains only; unfollows are not
-- provided, so exact historical totals cannot be reconstructed) + provenance.
alter table public.account_snapshots
  add column if not exists followers_gained integer,
  add column if not exists source text;

-- ---------------------------------------------------------------------------
-- Plans + multi-account Instagram (Pro feature)
-- ---------------------------------------------------------------------------

-- The user's plan. 'free' | 'pro'. Stripe will manage this once billing
-- lands; until then it is set manually. Everything gates closed by default.
alter table public.profiles add column if not exists plan text not null default 'free';

-- One row per connected Instagram account (was: one per user). ig_user_id
-- becomes part of the identity; exactly one account is active at a time and
-- every page reads through the active one.
alter table public.instagram_connections
  add column if not exists is_active boolean not null default true;

-- Backfill identity for rows connected before ig_user_id was captured.
update public.instagram_connections
  set ig_user_id = coalesce(ig_user_id, username, user_id::text)
  where ig_user_id is null;
alter table public.instagram_connections alter column ig_user_id set not null;

-- Swap the primary key user_id -> (user_id, ig_user_id), once.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'instagram_connections_pkey'
      and conrelid = 'public.instagram_connections'::regclass
      and array_length(conkey, 1) = 1
  ) then
    alter table public.instagram_connections drop constraint instagram_connections_pkey;
    alter table public.instagram_connections add primary key (user_id, ig_user_id);
  end if;
end $$;

-- At most one active account per user.
create unique index if not exists instagram_connections_one_active
  on public.instagram_connections (user_id) where is_active;

-- Snapshots become per-account so two accounts' histories never mix.
alter table public.account_snapshots add column if not exists ig_user_id text;
update public.account_snapshots s
  set ig_user_id = c.ig_user_id
  from public.instagram_connections c
  where s.user_id = c.user_id and s.ig_user_id is null;
-- Rows with no surviving connection can't be attributed to an account and
-- would pollute whichever account is read; drop them.
delete from public.account_snapshots where ig_user_id is null;
alter table public.account_snapshots alter column ig_user_id set not null;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'account_snapshots_pkey'
      and conrelid = 'public.account_snapshots'::regclass
      and array_length(conkey, 1) = 2
  ) then
    alter table public.account_snapshots drop constraint account_snapshots_pkey;
    alter table public.account_snapshots add primary key (user_id, ig_user_id, day);
  end if;
end $$;
