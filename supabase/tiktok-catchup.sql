-- TikTok connections, brought up to date in one step. Idempotent; safe to re-run.
--
-- Production never got tiktok-connections.sql, and workspaces.sql /
-- plans-security-fix.sql only touch the TikTok table "if it exists", so they
-- skipped it when they ran. This file creates the table AND applies every
-- TikTok part of those later migrations:
--   • one row per Brand Workspace (surrogate id, workspace_id, unique index)
--   • owner-only RLS
--   • the plan-pause lock on plan_suspended_at
-- It deliberately does NOT redefine socia_apply_plan_keep(): the version from
-- plans-security-fix.sql already handles TikTok whenever the table exists.

create table if not exists public.tiktok_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- App-scoped TikTok user id (stable per app; what post_destinations.account_id stores).
  open_id text,
  -- Same person across the developer's apps; kept for future cross-app lookups.
  union_id text,
  display_name text,
  username text,
  avatar_url text,
  profile_url text,
  bio text,
  is_verified boolean,
  follower_count integer,
  following_count integer,
  likes_count integer,
  video_count integer,
  access_token text not null,
  refresh_token text,
  scopes text[],
  token_expires_at timestamptz,
  refresh_expires_at timestamptz,
  -- Latest video.list page (public counts per video), refreshed by tiktokSync.
  videos jsonb,
  last_synced_at timestamptz,
  -- Set by the plan-downgrade pause flow; a paused account is kept, not read.
  plan_suspended_at timestamptz,
  connected_at timestamptz not null default now()
);

-- One TikTok account per Brand Workspace.
alter table public.tiktok_connections add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;
alter table public.tiktok_connections add column if not exists plan_suspended_at timestamptz;

-- If the table was created earlier by tiktok-connections.sql (user_id as the
-- primary key), swap to a surrogate id so a person can hold one per workspace.
do $blk$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'tiktok_connections_pkey'
       and conrelid = 'public.tiktok_connections'::regclass
       and array_length(conkey, 1) = 1
       and (select attname from pg_attribute where attrelid = conrelid and attnum = conkey[1]) = 'user_id'
  ) then
    alter table public.tiktok_connections add column if not exists id uuid not null default gen_random_uuid();
    alter table public.tiktok_connections drop constraint tiktok_connections_pkey;
    alter table public.tiktok_connections add primary key (id);
  end if;
end $blk$;

create index if not exists tiktok_connections_user_idx on public.tiktok_connections (user_id);

-- Any row without a workspace belongs to its owner's default workspace.
update public.tiktok_connections c
   set workspace_id = w.id
  from public.workspaces w
 where w.owner_id = c.user_id and w.is_default and c.workspace_id is null;

create unique index if not exists tiktok_connections_one_per_workspace on public.tiktok_connections (workspace_id);

-- Owner-only access. The server acts for invited team members through the
-- service role, exactly as for the other connection tables.
alter table public.tiktok_connections enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tiktok_connections' and policyname = 'tiktok_connections_owner_select') then
    create policy tiktok_connections_owner_select on public.tiktok_connections for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tiktok_connections' and policyname = 'tiktok_connections_owner_insert') then
    create policy tiktok_connections_owner_insert on public.tiktok_connections for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tiktok_connections' and policyname = 'tiktok_connections_owner_update') then
    create policy tiktok_connections_owner_update on public.tiktok_connections for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tiktok_connections' and policyname = 'tiktok_connections_owner_delete') then
    create policy tiktok_connections_owner_delete on public.tiktok_connections for delete using (auth.uid() = user_id);
  end if;
end $$;

-- Only SOCIA's server may pause or un-pause an account (plan downgrades).
drop trigger if exists socia_protect_pause_columns on public.tiktok_connections;
create trigger socia_protect_pause_columns
  before insert or update on public.tiktok_connections
  for each row execute function public.socia_protect_pause_columns();
