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

-- Tracked competitors: accounts the user chooses to watch. SOCIA stores the
-- handle only — platforms expose no analytics for other accounts, so every
-- metric column renders "—" until a platform provides verifiable public data.
create table if not exists public.tracked_competitors (
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null default 'instagram',
  handle text not null,
  added_at timestamptz not null default now(),
  primary key (user_id, platform, handle)
);

alter table public.tracked_competitors enable row level security;

create policy "Users can read their own competitors"
  on public.tracked_competitors for select using (auth.uid() = user_id);
create policy "Users can add their own competitors"
  on public.tracked_competitors for insert with check (auth.uid() = user_id);
create policy "Users can delete their own competitors"
  on public.tracked_competitors for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Discovery: accounts and content SOCIA finds for the user automatically.
--
-- Separate from tracked_competitors on purpose: discovery is a suggestion,
-- tracking is a decision. Rows carry their provenance so the UI can label
-- verified API data differently from web-discovered leads, and any metric a
-- source doesn't publish stays NULL (never 0 — unknown is not zero).
-- ---------------------------------------------------------------------------

create table if not exists public.discovered_accounts (
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null,
  -- Stable platform id where one exists (YouTube channelId), else the handle.
  platform_account_id text not null,
  handle text,
  display_name text,
  profile_image text,
  profile_url text,
  followers integer,          -- null = the platform doesn't publish it
  location text,
  category text,
  classification text not null default 'adjacent_competitor',
  relevance_score integer,
  relevance_reasons jsonb,
  data_source text not null,  -- youtube_api | web_research
  last_checked timestamptz not null default now(),
  primary key (user_id, platform, platform_account_id)
);

alter table public.discovered_accounts enable row level security;
create policy "Users read their own discovered accounts"
  on public.discovered_accounts for select using (auth.uid() = user_id);
create policy "Users write their own discovered accounts"
  on public.discovered_accounts for insert with check (auth.uid() = user_id);
create policy "Users update their own discovered accounts"
  on public.discovered_accounts for update using (auth.uid() = user_id);
create policy "Users delete their own discovered accounts"
  on public.discovered_accounts for delete using (auth.uid() = user_id);

create table if not exists public.discovered_content (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Canonical URL is the dedup key: the same video found by two searches
  -- must be stored once.
  content_url text not null,
  platform text not null,
  account_handle text,
  account_name text,
  account_image text,
  thumbnail_url text,
  title text,
  published_at timestamptz,
  content_type text,
  views bigint,
  likes bigint,
  comments bigint,
  -- Performance relative to the creator's own median, when both are real.
  multiplier numeric,
  relevance_score integer,
  relevance_reasons jsonb,
  trend_tags jsonb,
  why_recommended text,
  data_source text not null,
  last_checked timestamptz not null default now(),
  primary key (user_id, content_url)
);

alter table public.discovered_content enable row level security;
create policy "Users read their own discovered content"
  on public.discovered_content for select using (auth.uid() = user_id);
create policy "Users write their own discovered content"
  on public.discovered_content for insert with check (auth.uid() = user_id);
create policy "Users update their own discovered content"
  on public.discovered_content for update using (auth.uid() = user_id);
create policy "Users delete their own discovered content"
  on public.discovered_content for delete using (auth.uid() = user_id);

-- When discovery last ran, so the page can show "updated N minutes ago"
-- truthfully instead of implying it is live.
create table if not exists public.discovery_runs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  ran_at timestamptz not null default now(),
  accounts_found integer not null default 0,
  content_found integer not null default 0,
  sources jsonb
);

alter table public.discovery_runs enable row level security;
create policy "Users read their own discovery runs"
  on public.discovery_runs for select using (auth.uid() = user_id);
create policy "Users write their own discovery runs"
  on public.discovery_runs for insert with check (auth.uid() = user_id);
create policy "Users update their own discovery runs"
  on public.discovery_runs for update using (auth.uid() = user_id);

-- The Instagram Professional account linked to the connected Facebook Page.
-- Business Discovery (real public metrics for OTHER Instagram business
-- accounts) is only reachable through this Page-linked id, never through the
-- Instagram Login API.
alter table public.facebook_connections
  add column if not exists ig_business_id text,
  add column if not exists ig_business_username text;

-- Competitor snapshots fetched via Instagram Business Discovery. Public data
-- Meta serves for public Business/Creator accounts; anything it omits stays
-- NULL. Cached so the page doesn't re-query Meta on every render.
create table if not exists public.ig_competitor_snapshots (
  user_id uuid not null references auth.users (id) on delete cascade,
  handle text not null,
  display_name text,
  biography text,
  profile_picture text,
  followers integer,
  media_count integer,
  posts_per_week numeric,
  median_engagement numeric,
  engagement_rate numeric,
  media jsonb,
  fetched_at timestamptz not null default now(),
  primary key (user_id, handle)
);

alter table public.ig_competitor_snapshots enable row level security;
create policy "Users read their own ig competitor snapshots"
  on public.ig_competitor_snapshots for select using (auth.uid() = user_id);
create policy "Users write their own ig competitor snapshots"
  on public.ig_competitor_snapshots for insert with check (auth.uid() = user_id);
create policy "Users update their own ig competitor snapshots"
  on public.ig_competitor_snapshots for update using (auth.uid() = user_id);

-- The Instagram Professional account linked to the connected Page. Capturing
-- it is what enables Instagram Business Discovery (real public metrics for
-- other public business accounts) — see lib/igBusinessDiscovery.ts.
alter table public.facebook_connections
  add column if not exists ig_business_id text,
  add column if not exists ig_business_username text;

-- Cached competitor data from Business Discovery. Refreshed on demand rather
-- than on every render, and every column here is a value Meta actually
-- returned — anything it withholds stays null and renders "—".
create table if not exists public.ig_competitor_snapshots (
  user_id uuid not null references auth.users (id) on delete cascade,
  handle text not null,
  display_name text,
  biography text,
  profile_picture text,
  followers integer,
  media_count integer,
  posts_per_week numeric,
  median_engagement numeric,
  engagement_rate numeric,
  media jsonb,
  fetched_at timestamptz not null default now(),
  primary key (user_id, handle)
);

alter table public.ig_competitor_snapshots enable row level security;
create policy "Users read their own ig competitor snapshots"
  on public.ig_competitor_snapshots for select using (auth.uid() = user_id);
create policy "Users write their own ig competitor snapshots"
  on public.ig_competitor_snapshots for insert with check (auth.uid() = user_id);
create policy "Users update their own ig competitor snapshots"
  on public.ig_competitor_snapshots for update using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Scheduling: posts the user has queued for SOCIA to publish.
--
-- A row is a draft until it has media and a time; then it is `scheduled`. The
-- publisher moves it through publishing → published (with the real Instagram
-- media id and permalink) or failed (with Instagram's actual error). Nothing
-- is marked published until Instagram returns an id.
-- ---------------------------------------------------------------------------
create table if not exists public.scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ig_user_id text,
  plan_id uuid references public.plans (id) on delete set null,
  plan_day text,
  scheduled_at timestamptz not null,
  caption text not null default '',
  media_type text not null default 'REELS',   -- REELS | IMAGE
  media_path text,                            -- storage object path
  media_url text,                             -- public URL Instagram fetches
  status text not null default 'draft',       -- draft|scheduled|publishing|published|failed|cancelled
  container_id text,
  published_media_id text,
  permalink text,
  error text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scheduled_posts_due_idx
  on public.scheduled_posts (status, scheduled_at);
create index if not exists scheduled_posts_user_idx
  on public.scheduled_posts (user_id, scheduled_at);

alter table public.scheduled_posts enable row level security;

-- Media lives in a public bucket so Instagram can fetch it by URL. Objects are
-- namespaced by user id; policies keep writes to the owner.
insert into storage.buckets (id, name, public)
  values ('scheduled-media', 'scheduled-media', true)
  on conflict (id) do nothing;

-- The publish scopes Instagram actually granted at connect time, so the UI can
-- say truthfully whether auto-posting is possible for this account.
alter table public.instagram_connections
  add column if not exists scopes text[];

do $$
begin
  -- scheduled_posts policies (guarded)
  if not exists (select 1 from pg_policies where tablename='scheduled_posts' and policyname='Users read their own scheduled posts') then
    create policy "Users read their own scheduled posts" on public.scheduled_posts for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='scheduled_posts' and policyname='Users add their own scheduled posts') then
    create policy "Users add their own scheduled posts" on public.scheduled_posts for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='scheduled_posts' and policyname='Users edit their own scheduled posts') then
    create policy "Users edit their own scheduled posts" on public.scheduled_posts for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='scheduled_posts' and policyname='Users remove their own scheduled posts') then
    create policy "Users remove their own scheduled posts" on public.scheduled_posts for delete using (auth.uid() = user_id);
  end if;
  -- storage policies: owner-namespaced writes, public read
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Scheduled media: owner insert') then
    create policy "Scheduled media: owner insert" on storage.objects for insert to authenticated
      with check (bucket_id = 'scheduled-media' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Scheduled media: owner update') then
    create policy "Scheduled media: owner update" on storage.objects for update to authenticated
      using (bucket_id = 'scheduled-media' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Scheduled media: owner delete') then
    create policy "Scheduled media: owner delete" on storage.objects for delete to authenticated
      using (bucket_id = 'scheduled-media' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Scheduled media: public read') then
    create policy "Scheduled media: public read" on storage.objects for select
      using (bucket_id = 'scheduled-media');
  end if;
end $$;

-- The publisher's heartbeat: one row, rewritten by the cron runner each time it
-- runs, so the calendar can state when auto-publishing last actually ran.
create table if not exists public.publisher_heartbeat (
  id integer primary key,
  ran_at timestamptz not null,
  considered integer not null default 0,
  published integer not null default 0
);
alter table public.publisher_heartbeat enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='publisher_heartbeat' and policyname='Signed-in users read the publisher heartbeat') then
    create policy "Signed-in users read the publisher heartbeat" on public.publisher_heartbeat for select to authenticated using (true);
  end if;
end $$;
