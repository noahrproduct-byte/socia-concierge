-- SOCIA: competitor history (2026-09-29).
--
-- Run in the Supabase SQL editor AFTER team.sql. Idempotent.
--
-- One row per tracked competitor per UTC day, appended by the daily job so a
-- competitor's followers/subscribers accrue a real history instead of being
-- overwritten (ig_competitor_snapshots caches only the latest). This is what
-- makes competitor momentum real and gives the phase-2 competitor/trend alert
-- detectors something to compare against. Public counts only; nothing private.

create table if not exists public.competitor_snapshots (
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  platform text not null,               -- instagram | youtube
  handle text not null,
  day date not null,
  followers integer,                    -- IG followers / YouTube subscribers
  media_count integer,                  -- IG media / YouTube video count
  views_total bigint,                   -- YouTube lifetime views (null for IG)
  retrieved_at timestamptz not null default now(),
  primary key (user_id, platform, handle, day)
);

create index if not exists competitor_snapshots_lookup on public.competitor_snapshots (user_id, platform, handle, day desc);

alter table public.competitor_snapshots enable row level security;

-- The owner and the workspace's members may read; only the service role writes
-- (the daily job). socia_ws_role() comes from team.sql.
do $blk$
begin
  drop policy if exists "competitor_snapshots read" on public.competitor_snapshots;
  create policy "competitor_snapshots read" on public.competitor_snapshots for select
    using (user_id = auth.uid() or public.socia_ws_role(workspace_id) is not null);
end $blk$;
