-- SOCIA 2.0 Phase 2: the Growth Profile.
-- Two per-brand tables:
--   growth_goals      measurable goals (metric, where, starting point, target, date)
--   onboarding_state  where a brand's setup stands, so it can be resumed
-- The rest of the profile lives in the existing brand_detail jsonb under the
-- "growth" key and needs no change here.
--
-- Same pattern as studio.sql: owned by the workspace OWNER (user_id), scoped
-- to a Brand Workspace, owner-only row-level security (invited team members
-- act through the server's service role, by role), and the workspace guard
-- trigger from security-hardening.sql so a row can't point at someone else's
-- workspace. Run after rls-audit.sql: Dashboard -> SQL Editor -> New query ->
-- paste -> Run. Safe to re-run. Nothing existing is changed.

-- ---------------------------------------------------------------------------
-- 1. Goals
-- ---------------------------------------------------------------------------
create table if not exists public.growth_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  -- primary | secondary
  kind text not null default 'primary',
  -- lib/growth.ts GOAL_METRICS ids
  metric text not null,
  -- instagram | facebook | youtube | tiktok; empty for a number the person reports
  platforms text[] not null default '{}',
  baseline double precision,
  baseline_at timestamptz,
  -- Reported metrics only (bookings, sales...): the latest number the person entered.
  current_value double precision,
  current_at timestamptz,
  target double precision not null,
  due_date date,
  -- active | achieved | dropped
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint growth_goals_kind_check check (kind in ('primary', 'secondary')),
  constraint growth_goals_status_check check (status in ('active', 'achieved', 'dropped')),
  constraint growth_goals_target_check check (target > 0)
);
create index if not exists growth_goals_owner_idx on public.growth_goals (user_id, workspace_id, status);

-- ---------------------------------------------------------------------------
-- 2. Onboarding progress, one row per brand
-- ---------------------------------------------------------------------------
create table if not exists public.onboarding_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  -- The step to resume at (lib/onboarding.ts STEPS).
  step text not null default 'connect',
  -- Flow bookkeeping only (which steps were saved, whether the account read ran).
  -- The answers themselves are saved where they belong: brand_detail and growth_goals.
  answers jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists onboarding_state_brand_idx
  on public.onboarding_state (user_id, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ---------------------------------------------------------------------------
-- 3. RLS: the owner's own session reads and writes their rows.
-- ---------------------------------------------------------------------------
alter table public.growth_goals enable row level security;
alter table public.onboarding_state enable row level security;

do $$
declare t text;
begin
  foreach t in array array['growth_goals', 'onboarding_state'] loop
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t || ' owner select') then
      execute format('create policy %I on public.%I for select using (auth.uid() = user_id)', t || ' owner select', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t || ' owner insert') then
      execute format('create policy %I on public.%I for insert with check (auth.uid() = user_id)', t || ' owner insert', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t || ' owner update') then
      execute format('create policy %I on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t || ' owner update', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t || ' owner delete') then
      execute format('create policy %I on public.%I for delete using (auth.uid() = user_id)', t || ' owner delete', t);
    end if;
  end loop;
end $$;

-- Signed-out visitors get nothing (rls-audit.sql already removes anon's
-- default privileges; this keeps it true if the order ever changes).
revoke all on public.growth_goals from anon;
revoke all on public.onboarding_state from anon;

-- ---------------------------------------------------------------------------
-- 4. A row may only name a workspace its owner owns.
-- ---------------------------------------------------------------------------
do $blk$
declare t text;
begin
  foreach t in array array['growth_goals', 'onboarding_state'] loop
    execute format('drop trigger if exists socia_guard_workspace_fk on public.%I', t);
    execute format('create trigger socia_guard_workspace_fk before insert or update on public.%I for each row execute function public.socia_guard_workspace_fk()', t);
  end loop;
end $blk$;
