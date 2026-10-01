-- Platform-general daily snapshots.
--
-- Instagram already builds durable follower history in account_snapshots (see
-- schema.sql). This table does the same thing for every OTHER platform so each
-- connected account accumulates a real trend whether or not anyone opens SOCIA.
-- One row per account per UTC day; the first observation of the day wins, so
-- the series is taken at a consistent time. null is never written as 0 —
-- "unavailable" and "zero" stay distinct, exactly as the rest of SOCIA treats
-- metrics.
--
-- Point-in-time audience counts (Facebook Page followers/fans, YouTube
-- subscribers) go in `followers`; SOCIA differences consecutive days to show
-- growth. Platforms that expose a genuine per-day series from their own API
-- (YouTube: views / watch time / subscriber gains — Phase 3) also fill the
-- flow columns. `source` records which kind a row is:
--   'socia_snapshot'  -> a point-in-time count SOCIA recorded itself
--   '<platform>_api'  -> a finalised daily value from the platform's own series
--
-- Additive and safe to run before the code that writes it ships: the writers
-- degrade to a no-op when this table is absent.

create table if not exists public.platform_snapshots (
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete set null,
  platform text not null,            -- 'facebook' | 'youtube' | 'tiktok' | 'instagram'
  account_id text not null,          -- page_id / channel_id / open_id / ig_user_id
  day date not null,
  followers integer,                 -- point-in-time audience count (fans/subscribers/followers)
  views integer,                     -- daily views, where a real per-day series exists
  followers_gained integer,          -- daily net/gained audience, where provided
  watch_time_minutes integer,        -- YouTube only
  source text,
  retrieved_at timestamptz not null default now(),
  primary key (user_id, platform, account_id, day)
);

alter table public.platform_snapshots enable row level security;

create policy "Users can read their own platform snapshots"
  on public.platform_snapshots for select using (auth.uid() = user_id);
create policy "Users can add their own platform snapshots"
  on public.platform_snapshots for insert with check (auth.uid() = user_id);
create policy "Users can update their own platform snapshots"
  on public.platform_snapshots for update using (auth.uid() = user_id);

-- Read path: "this account's series" and "this workspace's series".
create index if not exists platform_snapshots_account
  on public.platform_snapshots (user_id, platform, account_id, day);
create index if not exists platform_snapshots_workspace
  on public.platform_snapshots (workspace_id, platform, day);
