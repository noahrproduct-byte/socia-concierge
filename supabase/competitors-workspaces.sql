-- Brand Workspace isolation for competitors.
-- Run in the Supabase SQL editor AFTER workspaces.sql. Idempotent and safe to
-- re-run.
--
-- Model: competitors become PER-WORKSPACE for display, tracking, discovery and
-- momentum — each brand tracks and sees its own. The plan LIMIT stays a SHARED
-- POOL across a user's workspaces: socia_add_competitor still counts every
-- active competitor the user has (any workspace) against the cap, and the
-- downgrade "keep" decision (socia_apply_plan_keep) still spans all workspaces
-- by design, so those stay pooled and are untouched here.
--
-- The app calls the new workspace-aware add function and scopes its reads by
-- workspace_id, both with a fallback to the pooled path, so deploying the app
-- before this runs changes nothing; isolation begins the moment this is applied.

-- ---------------------------------------------------------------------------
-- 1. workspace_id on the four tables that lack it (competitor_snapshots has it).
-- ---------------------------------------------------------------------------
alter table public.tracked_competitors add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;
alter table public.discovered_accounts add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;
alter table public.discovered_content  add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;
alter table public.discovery_runs      add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- 2. Backfill every existing row to the owner's default workspace.
-- ---------------------------------------------------------------------------
update public.tracked_competitors t set workspace_id = w.id
  from public.workspaces w where t.workspace_id is null and w.owner_id = t.user_id and w.is_default;
update public.discovered_accounts d set workspace_id = w.id
  from public.workspaces w where d.workspace_id is null and w.owner_id = d.user_id and w.is_default;
update public.discovered_content d set workspace_id = w.id
  from public.workspaces w where d.workspace_id is null and w.owner_id = d.user_id and w.is_default;
update public.discovery_runs d set workspace_id = w.id
  from public.workspaces w where d.workspace_id is null and w.owner_id = d.user_id and w.is_default;

-- competitor_snapshots is intentionally NOT changed: follower/subscriber counts
-- are public and handle-scoped, its momentum read only looks up handles that are
-- already displayed for the active workspace, and its writer only knows the
-- default workspace. Scoping it would hide a second brand's momentum. Left as is.

-- ---------------------------------------------------------------------------
-- 3. Widen the primary keys to include the workspace, so the same handle/URL
--    can exist in two brands. Guarded on a complete backfill (workspace_id must
--    be non-null to enter a primary key); if any row is still null the old key
--    is kept and the migration can be re-run after fixing the row.
-- ---------------------------------------------------------------------------
do $$
begin
  -- tracked_competitors: (user_id, platform, handle) -> (+ workspace_id)
  if not exists (select 1 from public.tracked_competitors where workspace_id is null) then
    alter table public.tracked_competitors alter column workspace_id set not null;
    alter table public.tracked_competitors drop constraint if exists tracked_competitors_pkey;
    alter table public.tracked_competitors add constraint tracked_competitors_pkey primary key (user_id, workspace_id, platform, handle);
  end if;

  -- discovered_accounts: (user_id, platform, platform_account_id) -> (+ workspace_id)
  if not exists (select 1 from public.discovered_accounts where workspace_id is null) then
    alter table public.discovered_accounts alter column workspace_id set not null;
    alter table public.discovered_accounts drop constraint if exists discovered_accounts_pkey;
    alter table public.discovered_accounts add constraint discovered_accounts_pkey primary key (user_id, workspace_id, platform, platform_account_id);
  end if;

  -- discovered_content: (user_id, content_url) -> (+ workspace_id)
  if not exists (select 1 from public.discovered_content where workspace_id is null) then
    alter table public.discovered_content alter column workspace_id set not null;
    alter table public.discovered_content drop constraint if exists discovered_content_pkey;
    alter table public.discovered_content add constraint discovered_content_pkey primary key (user_id, workspace_id, content_url);
  end if;

  -- discovery_runs: (user_id) -> (user_id, workspace_id)  [one row per workspace]
  if not exists (select 1 from public.discovery_runs where workspace_id is null) then
    alter table public.discovery_runs alter column workspace_id set not null;
    alter table public.discovery_runs drop constraint if exists discovery_runs_pkey;
    alter table public.discovery_runs add constraint discovery_runs_pkey primary key (user_id, workspace_id);
  end if;
end $$;

create index if not exists tracked_competitors_workspace_idx on public.tracked_competitors (user_id, workspace_id);
create index if not exists discovered_accounts_workspace_idx on public.discovered_accounts (user_id, workspace_id);
create index if not exists discovered_content_workspace_idx  on public.discovered_content (user_id, workspace_id);

-- ---------------------------------------------------------------------------
-- 4. Workspace-aware add. NEW overload (keeps the 4-arg version so the app can
--    fall back before this runs). The active-competitor COUNT stays POOLED
--    across the user's workspaces (the plan limit is shared); only the
--    existence check and the insert are per workspace.
-- ---------------------------------------------------------------------------
create or replace function public.socia_add_competitor(p_user uuid, p_workspace uuid, p_platform text, p_handle text, p_limit integer)
returns table (added boolean, already boolean, active_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active boolean;
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text));

  -- Already in THIS workspace?
  select t.is_active into v_active
    from public.tracked_competitors t
    where t.user_id = p_user and t.workspace_id = p_workspace and t.platform = p_platform and t.handle = p_handle;

  -- Pooled count: every active competitor the user has, across all workspaces.
  select count(*) into v_count
    from public.tracked_competitors t
    where t.user_id = p_user and t.is_active;

  if coalesce(v_active, false) then
    return query select false, true, v_count;
    return;
  end if;

  if v_count >= p_limit then
    return query select false, false, v_count;
    return;
  end if;

  insert into public.tracked_competitors (user_id, workspace_id, platform, handle, is_active)
    values (p_user, p_workspace, p_platform, p_handle, true)
    on conflict (user_id, workspace_id, platform, handle) do update set is_active = true;

  return query select true, false, v_count + 1;
end $$;

revoke all on function public.socia_add_competitor(uuid, uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.socia_add_competitor(uuid, uuid, text, text, integer) to service_role;

-- socia_apply_plan_keep is deliberately left pooled: the competitor limit is a
-- shared pool, so the downgrade "keep" choice spans all of a user's workspaces
-- (by platform:handle). No change needed.
