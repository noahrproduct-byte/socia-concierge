-- The posting streak against a person's own weekly target (lib/postingStreak.ts).
-- Run after perks.sql. Safe to re-run. Nothing existing is changed.
--
-- 1. posting_targets: each time a brand's posting target changes, the number
--    of posting days a week and the Monday it starts from. A change starts
--    with the next week, so the week in progress and every week before it keep
--    the target they began with.
-- 2. posting_weeks: one row per brand per week, written once the week is over
--    (posting days counted, the target it was held to, whether it qualified),
--    or earlier when the person plans a break week. A finished week is never
--    counted again, so a post deleted later doesn't change it.
--
-- Both are read by their owner and written only by SOCIA's server (the
-- service role): a streak earns AI credits, so a browser must not be able to
-- write one. workspace_id is null for the default brand.

create table if not exists public.posting_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  days integer not null check (days between 1 and 7),
  effective_from date not null,
  created_at timestamptz not null default now()
);
create index if not exists posting_targets_brand_idx on public.posting_targets (user_id, workspace_id, effective_from);

create table if not exists public.posting_weeks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  -- The Monday the week starts on, in the person's own time zone.
  week_start date not null,
  target integer not null check (target between 1 and 7),
  days integer not null default 0 check (days between 0 and 7),
  qualified boolean not null default false,
  -- A planned break: the week neither counts nor breaks the streak.
  is_break boolean not null default false,
  -- Set when the week was written down for good; null for a planned break not yet over.
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One row per brand per week (the default brand has no workspace id).
create unique index if not exists posting_weeks_brand_week_idx
  on public.posting_weeks (user_id, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), week_start);

alter table public.posting_targets enable row level security;
alter table public.posting_weeks enable row level security;

-- The owner reads their own rows. No insert, update or delete policy: only the service role writes.
drop policy if exists posting_targets_read_own on public.posting_targets;
create policy posting_targets_read_own on public.posting_targets for select to authenticated using (auth.uid() = user_id);
drop policy if exists posting_weeks_read_own on public.posting_weeks;
create policy posting_weeks_read_own on public.posting_weeks for select to authenticated using (auth.uid() = user_id);

revoke all on public.posting_targets from anon;
revoke all on public.posting_weeks from anon;
revoke insert, update, delete on public.posting_targets from authenticated;
revoke insert, update, delete on public.posting_weeks from authenticated;

-- Check: both tables exist, with row-level security on and one read policy each.
select c.relname as table_name, c.relrowsecurity as rls_on,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('posting_targets', 'posting_weeks')
order by c.relname;
