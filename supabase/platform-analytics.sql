-- Universal cross-platform analytics storage. Instagram already has its own
-- daily history in account_snapshots; these tables give every OTHER platform a
-- place to accumulate history and let future features store per-content and
-- demographic history. Idempotent and safe to re-run.
--
-- Run once in the Supabase SQL editor. Until it exists, the app degrades
-- gracefully: YouTube/Facebook simply have no stored history yet (their live
-- values still render), and nothing errors.

-- ---------------------------------------------------------------------------
-- platform_snapshots: one point-in-time row per account per UTC day. Followers
-- and lifetime/period counts are recorded so a real daily series builds over
-- time. First write of the day wins (the app inserts, ignoring duplicates), so
-- the series is taken at a consistent point. NULL means "not recorded", never 0.
-- ---------------------------------------------------------------------------
create table if not exists public.platform_snapshots (
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('instagram', 'youtube', 'facebook', 'tiktok')),
  account_id text not null default '',
  day date not null,
  followers integer,       -- followers / subscribers, a level
  views bigint,            -- lifetime or period views where the platform reports one
  reach integer,
  watch_time integer,      -- minutes
  posts integer,           -- lifetime content count where reported
  source text,
  retrieved_at timestamptz not null default now(),
  primary key (user_id, platform, account_id, day)
);

alter table public.platform_snapshots enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'platform_snapshots' and policyname = 'platform_snapshots_owner') then
    create policy platform_snapshots_owner on public.platform_snapshots
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

create index if not exists platform_snapshots_lookup on public.platform_snapshots (user_id, platform, account_id, day);

-- ---------------------------------------------------------------------------
-- content_metrics: per-content history across platforms (scaffolding for a
-- future "how did this post do over time" view). external_post_id matches
-- post_destinations. Not yet written by the app; created so the schema is ready.
-- ---------------------------------------------------------------------------
create table if not exists public.content_metrics (
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('instagram', 'youtube', 'facebook', 'tiktok')),
  account_id text not null default '',
  external_post_id text not null,
  day date not null,
  views bigint,
  likes integer,
  comments integer,
  shares integer,
  saves integer,
  reach integer,
  watch_time integer,
  retrieved_at timestamptz not null default now(),
  primary key (user_id, platform, external_post_id, day)
);

alter table public.content_metrics enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'content_metrics' and policyname = 'content_metrics_owner') then
    create policy content_metrics_owner on public.content_metrics
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- audience_demographics: stored audience breakdowns per account (scaffolding).
-- Instagram/YouTube demographics currently render live; this lets SOCIA keep a
-- history of them later. dimension = age|gender|city|country. Not yet written.
-- ---------------------------------------------------------------------------
create table if not exists public.audience_demographics (
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('instagram', 'youtube', 'facebook', 'tiktok')),
  account_id text not null default '',
  captured_on date not null,
  dimension text not null,
  bucket text not null,
  value numeric,
  primary key (user_id, platform, account_id, captured_on, dimension, bucket)
);

alter table public.audience_demographics enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audience_demographics' and policyname = 'audience_demographics_owner') then
    create policy audience_demographics_owner on public.audience_demographics
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
