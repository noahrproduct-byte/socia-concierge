-- SOCIA: Brand Workspaces (2026-09-25).
--
-- Run in the Supabase SQL editor AFTER plans-and-usage.sql and
-- plans-security-fix.sql. Idempotent: safe to run again.
--
-- A Brand Workspace is one creator, business, location, brand or client.
-- Inside a workspace a person connects up to one account on each platform
-- (Instagram, Facebook, TikTok, YouTube). Plans cap the number of workspaces.
--
-- What this does:
--   1. workspaces table (owner, name, brand profile, pause column, one default per owner).
--   2. profiles.active_workspace_id: the workspace the app currently reads through.
--   3. workspace_id on every connection table, on content plans, scheduled
--      posts and post destinations. Nullable and additive: code paths that run
--      before this migration keep working.
--   4. Backfill: one default workspace per existing user, seeded from their
--      profile's brand fields. Every Facebook/YouTube/TikTok row and the ACTIVE
--      Instagram row join it. Each extra Instagram account becomes its own
--      workspace (named after the handle). Nothing is deleted or paused here;
--      a plan that is now over its workspace limit shows the "choose what to
--      keep" flow in Settings, as after any downgrade.
--   5. One account per platform per workspace (unique workspace_id on each
--      connection table), and Facebook/YouTube/TikTok move from a user_id
--      primary key to a surrogate id so a person can hold one per workspace.
--   6. Atomic, plan-aware workspace creation (service role) and an atomic
--      "switch active workspace" for the signed-in owner.

-- ---------------------------------------------------------------------------
-- 1. workspaces
-- ---------------------------------------------------------------------------
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  -- Brand profile for this workspace. Mirrors the profiles brand columns; the
  -- default workspace is seeded from them and every workspace edits its own.
  niche text,
  brand_name text,
  goals text,
  brand_detail jsonb,
  niche_detail jsonb,
  niche_analyzed_at timestamptz,
  -- Paused by a plan downgrade: kept, not read. Locked by trigger below.
  plan_suspended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists workspaces_one_default on public.workspaces (owner_id) where is_default;
create index if not exists workspaces_owner_idx on public.workspaces (owner_id, created_at);

alter table public.workspaces enable row level security;

do $blk$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'workspaces' and policyname = 'workspaces owner select') then
    create policy "workspaces owner select" on public.workspaces for select using (auth.uid() = owner_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'workspaces' and policyname = 'workspaces owner insert') then
    create policy "workspaces owner insert" on public.workspaces for insert with check (auth.uid() = owner_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'workspaces' and policyname = 'workspaces owner update') then
    create policy "workspaces owner update" on public.workspaces for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'workspaces' and policyname = 'workspaces owner delete') then
    create policy "workspaces owner delete" on public.workspaces for delete using (auth.uid() = owner_id);
  end if;

  -- The pause column is managed by SOCIA billing only (same trigger as the connection tables).
  drop trigger if exists socia_protect_pause_columns on public.workspaces;
  create trigger socia_protect_pause_columns
    before insert or update on public.workspaces
    for each row execute function public.socia_protect_pause_columns();
end $blk$;

-- ---------------------------------------------------------------------------
-- 2. The active workspace
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists active_workspace_id uuid references public.workspaces (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 3. workspace_id on tenant tables (nullable, additive)
-- ---------------------------------------------------------------------------
alter table public.instagram_connections add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;
alter table public.facebook_connections add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;
do $blk$
begin
  if to_regclass('public.youtube_connections') is not null then
    execute 'alter table public.youtube_connections add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade';
  end if;
  if to_regclass('public.tiktok_connections') is not null then
    execute 'alter table public.tiktok_connections add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade';
  end if;
  if to_regclass('public.post_destinations') is not null then
    execute 'alter table public.post_destinations add column if not exists workspace_id uuid references public.workspaces (id) on delete set null';
  end if;
end $blk$;
alter table public.plans add column if not exists workspace_id uuid references public.workspaces (id) on delete set null;
alter table public.scheduled_posts add column if not exists workspace_id uuid references public.workspaces (id) on delete set null;

create index if not exists instagram_connections_workspace_idx on public.instagram_connections (workspace_id);
create index if not exists plans_workspace_idx on public.plans (workspace_id, created_at desc);
create index if not exists scheduled_posts_workspace_idx on public.scheduled_posts (workspace_id, scheduled_at);

-- ---------------------------------------------------------------------------
-- 4. Backfill
-- ---------------------------------------------------------------------------
do $blk$
declare
  r record;
  v_ws uuid;
  v_name text;
begin
  -- 4a. A default workspace for every user who has a profile, seeded from it.
  insert into public.workspaces (owner_id, name, is_default, niche, brand_name, goals, brand_detail, niche_detail, niche_analyzed_at)
  select p.user_id, coalesce(nullif(trim(p.brand_name), ''), 'My brand'), true,
         p.niche, p.brand_name, p.goals, p.brand_detail, p.niche_detail, p.niche_analyzed_at
    from public.profiles p
   where not exists (select 1 from public.workspaces w where w.owner_id = p.user_id and w.is_default);

  -- 4b. Users with a connection but no profile row still get a default workspace.
  for r in
    select distinct user_id from public.instagram_connections
    union select distinct user_id from public.facebook_connections
  loop
    if not exists (select 1 from public.workspaces w where w.owner_id = r.user_id and w.is_default) then
      insert into public.workspaces (owner_id, name, is_default) values (r.user_id, 'My brand', true);
    end if;
  end loop;
  if to_regclass('public.youtube_connections') is not null then
    for r in execute 'select distinct user_id from public.youtube_connections' loop
      if not exists (select 1 from public.workspaces w where w.owner_id = r.user_id and w.is_default) then
        insert into public.workspaces (owner_id, name, is_default) values (r.user_id, 'My brand', true);
      end if;
    end loop;
  end if;
  if to_regclass('public.tiktok_connections') is not null then
    for r in execute 'select distinct user_id from public.tiktok_connections' loop
      if not exists (select 1 from public.workspaces w where w.owner_id = r.user_id and w.is_default) then
        insert into public.workspaces (owner_id, name, is_default) values (r.user_id, 'My brand', true);
      end if;
    end loop;
  end if;

  -- 4c. The default workspace is the active one until the person switches.
  update public.profiles p
     set active_workspace_id = w.id
    from public.workspaces w
   where w.owner_id = p.user_id and w.is_default and p.active_workspace_id is null;

  -- 4d. The ACTIVE Instagram row joins the default workspace.
  update public.instagram_connections c
     set workspace_id = w.id
    from public.workspaces w
   where w.owner_id = c.user_id and w.is_default and c.workspace_id is null and c.is_active;

  -- 4e. Every other Instagram row becomes its own workspace, named after the handle.
  for r in
    select user_id, ig_user_id, username, connected_at
      from public.instagram_connections
     where workspace_id is null
     order by connected_at
  loop
    v_name := coalesce(nullif('@' || r.username, '@'), 'Instagram ' || r.ig_user_id);
    insert into public.workspaces (owner_id, name, is_default) values (r.user_id, v_name, false) returning id into v_ws;
    update public.instagram_connections set workspace_id = v_ws where user_id = r.user_id and ig_user_id = r.ig_user_id;
  end loop;

  -- 4f. Facebook, YouTube and TikTok (one per user today) join the default workspace.
  update public.facebook_connections c
     set workspace_id = w.id
    from public.workspaces w
   where w.owner_id = c.user_id and w.is_default and c.workspace_id is null;
  if to_regclass('public.youtube_connections') is not null then
    execute 'update public.youtube_connections c set workspace_id = w.id from public.workspaces w where w.owner_id = c.user_id and w.is_default and c.workspace_id is null';
  end if;
  if to_regclass('public.tiktok_connections') is not null then
    execute 'update public.tiktok_connections c set workspace_id = w.id from public.workspaces w where w.owner_id = c.user_id and w.is_default and c.workspace_id is null';
  end if;

  -- 4g. Content plans and scheduled posts: the Instagram account's workspace when
  --     known, otherwise the default workspace.
  update public.scheduled_posts s
     set workspace_id = c.workspace_id
    from public.instagram_connections c
   where s.workspace_id is null and s.ig_user_id is not null and c.user_id = s.user_id and c.ig_user_id = s.ig_user_id and c.workspace_id is not null;
  update public.scheduled_posts s
     set workspace_id = w.id
    from public.workspaces w
   where s.workspace_id is null and w.owner_id = s.user_id and w.is_default;
  update public.plans p
     set workspace_id = w.id
    from public.workspaces w
   where p.workspace_id is null and w.owner_id = p.user_id and w.is_default;
  if to_regclass('public.post_destinations') is not null then
    execute 'update public.post_destinations d set workspace_id = s.workspace_id from public.scheduled_posts s where d.workspace_id is null and s.id = d.post_id and s.workspace_id is not null';
  end if;
end $blk$;

-- ---------------------------------------------------------------------------
-- 5. One account per platform per workspace; surrogate keys for the one-row-per-user tables
-- ---------------------------------------------------------------------------
-- Plain (not partial) unique indexes so ON CONFLICT (workspace_id) can use them;
-- NULLs are distinct, so rows from before the backfill never collide.
create unique index if not exists instagram_connections_one_per_workspace on public.instagram_connections (workspace_id);
create unique index if not exists facebook_connections_one_per_workspace on public.facebook_connections (workspace_id);

do $blk$
begin
  if to_regclass('public.youtube_connections') is not null then
    execute 'create unique index if not exists youtube_connections_one_per_workspace on public.youtube_connections (workspace_id)';
  end if;
  if to_regclass('public.tiktok_connections') is not null then
    execute 'create unique index if not exists tiktok_connections_one_per_workspace on public.tiktok_connections (workspace_id)';
  end if;
end $blk$;

-- Facebook / YouTube / TikTok: user_id was the primary key (one row per user).
-- Swap to a surrogate id, once, so a person can hold one account per workspace.
-- Reads by user_id still work (there is an index); the app writes with
-- ON CONFLICT (workspace_id) once workspaces exist.
do $blk$
declare
  t text;
begin
  foreach t in array array['facebook_connections', 'youtube_connections', 'tiktok_connections'] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    if exists (
      select 1 from pg_constraint
       where conname = t || '_pkey'
         and conrelid = ('public.' || t)::regclass
         and array_length(conkey, 1) = 1
         and (select attname from pg_attribute where attrelid = conrelid and attnum = conkey[1]) = 'user_id'
    ) then
      execute format('alter table public.%I add column if not exists id uuid not null default gen_random_uuid()', t);
      execute format('alter table public.%I drop constraint %I', t, t || '_pkey');
      execute format('alter table public.%I add primary key (id)', t);
    end if;
    execute format('create index if not exists %I on public.%I (user_id)', t || '_user_idx', t);
  end loop;
end $blk$;

-- ---------------------------------------------------------------------------
-- 6. Functions
-- ---------------------------------------------------------------------------
-- Atomic, plan-aware workspace creation. Service role only: p_limit is trusted
-- because only SOCIA's server can call this (it resolves the plan first).
create or replace function public.socia_create_workspace(p_user uuid, p_name text, p_limit integer)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_active integer;
  v_id uuid;
  v_first boolean;
begin
  perform pg_advisory_xact_lock(hashtext('ws:' || p_user::text));
  select count(*) into v_active from public.workspaces w where w.owner_id = p_user and w.plan_suspended_at is null;
  if v_active >= p_limit then
    raise exception 'workspace limit reached' using errcode = '22023';
  end if;
  v_first := not exists (select 1 from public.workspaces w where w.owner_id = p_user and w.is_default);
  insert into public.workspaces (owner_id, name, is_default)
    values (p_user, coalesce(nullif(trim(p_name), ''), 'My brand'), v_first)
    returning id into v_id;
  -- The first workspace becomes the active one.
  update public.profiles set active_workspace_id = coalesce(active_workspace_id, v_id) where user_id = p_user;
  return v_id;
end $fn$;

revoke all on function public.socia_create_workspace(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.socia_create_workspace(uuid, text, integer) to service_role;

-- Switch the active workspace for the signed-in owner, atomically: sets
-- profiles.active_workspace_id and points the Instagram is_active flag at
-- that workspace's account (every Instagram read goes through is_active).
-- A paused workspace cannot become active.
create or replace function public.socia_set_active_workspace(p_workspace uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.workspaces w where w.id = p_workspace and w.owner_id = v_user) then
    raise exception 'unknown workspace' using errcode = '22023';
  end if;
  if exists (select 1 from public.workspaces w where w.id = p_workspace and w.plan_suspended_at is not null) then
    raise exception 'workspace is paused' using errcode = '22023';
  end if;
  update public.profiles set active_workspace_id = p_workspace where user_id = v_user;
  if not exists (select 1 from public.profiles where user_id = v_user) then
    insert into public.profiles (user_id, active_workspace_id) values (v_user, p_workspace);
  end if;
  update public.instagram_connections set is_active = false where user_id = v_user;
  update public.instagram_connections set is_active = true
   where user_id = v_user and workspace_id = p_workspace and plan_suspended_at is null;
end $fn$;

revoke all on function public.socia_set_active_workspace(uuid) from public, anon;
grant execute on function public.socia_set_active_workspace(uuid) to authenticated, service_role;
