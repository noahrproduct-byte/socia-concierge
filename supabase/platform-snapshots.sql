-- Platform-general daily snapshots.
--
-- Instagram already builds durable follower history in account_snapshots (see
-- schema.sql). This table does the same thing for every OTHER platform so each
-- connected account accumulates a real trend whether or not anyone opens SOCIA.
-- One row per account per UTC day; the first observation of the day wins. null
-- is never written as 0 — "unavailable" and "zero" stay distinct.
--
-- Point-in-time audience counts (Facebook Page followers/fans, YouTube
-- subscribers) go in `followers`; SOCIA differences consecutive days for growth.
-- Platforms that expose a genuine per-day series from their own API (YouTube:
-- views / watch time / subscriber gains) also fill the flow columns. `source`
-- records which kind a row is:
--   'socia_snapshot'  -> a point-in-time count SOCIA recorded itself
--   '<platform>_api'  -> a finalised daily value from the platform's own series
--
-- Idempotent and additive: safe to run more than once, and it self-heals a
-- partially-created table by adding any missing columns. Columns are added
-- individually (the same convention schema.sql uses) so order and prior state
-- don't matter. `workspace_id` is a plain column (no FK) — snapshots are scoped
-- by user_id + account_id in the app; workspace_id is only a convenience filter.

create table if not exists public.platform_snapshots (
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null,            -- 'facebook' | 'youtube' | 'tiktok' | 'instagram'
  account_id text not null,          -- page_id / channel_id / open_id / ig_user_id
  day date not null,
  primary key (user_id, platform, account_id, day)
);

-- Columns added separately so a table from an earlier/partial run gains anything
-- it's missing (this is what fixes "column workspace_id does not exist").
alter table public.platform_snapshots add column if not exists workspace_id uuid;
alter table public.platform_snapshots add column if not exists followers integer;
alter table public.platform_snapshots add column if not exists views integer;
alter table public.platform_snapshots add column if not exists followers_gained integer;
alter table public.platform_snapshots add column if not exists watch_time_minutes integer;
alter table public.platform_snapshots add column if not exists source text;
alter table public.platform_snapshots add column if not exists retrieved_at timestamptz not null default now();

alter table public.platform_snapshots enable row level security;

-- Policies dropped-then-created so re-running never errors with "already exists".
drop policy if exists "Users can read their own platform snapshots" on public.platform_snapshots;
create policy "Users can read their own platform snapshots"
  on public.platform_snapshots for select using (auth.uid() = user_id);

drop policy if exists "Users can add their own platform snapshots" on public.platform_snapshots;
create policy "Users can add their own platform snapshots"
  on public.platform_snapshots for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own platform snapshots" on public.platform_snapshots;
create policy "Users can update their own platform snapshots"
  on public.platform_snapshots for update using (auth.uid() = user_id);

-- Read path: "this account's series" and "this workspace's series".
create index if not exists platform_snapshots_account
  on public.platform_snapshots (user_id, platform, account_id, day);
create index if not exists platform_snapshots_workspace
  on public.platform_snapshots (workspace_id, platform, day);
