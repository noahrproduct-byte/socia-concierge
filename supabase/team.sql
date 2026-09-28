-- SOCIA: Team members (2026-09-28).
--
-- Run in the Supabase SQL editor AFTER workspaces.sql. Idempotent.
--
-- A workspace owner can invite other SOCIA users into a Brand Workspace as
-- Admin or Member. The plan's team_members limit (owner included) is counted
-- per OWNER across all of their workspaces and enforced atomically when an
-- invite is accepted. Invites are links (no email provider yet).
--
-- Access model: members never get row-level access to the owner's data. The
-- server verifies membership and then reads the owner's workspace on their
-- behalf through the service role, so no RLS policy on any data table changes
-- and tokens never become readable by a member's session. The only widening
-- here is that a member may SELECT the workspace row itself (name, brand
-- profile) so the app can show which workspace they are in.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  -- Display label captured at accept time (auth.users is not readable by sessions).
  email text,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists workspace_members_user_idx on public.workspace_members (user_id);

create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  token text not null unique,
  -- Optional hint of who it was made for; not enforced (any signed-in user with the link can accept).
  email text,
  created_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists workspace_invites_ws_idx on public.workspace_invites (workspace_id, created_at desc);

alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Helpers (security definer so policies can consult workspaces without recursion)
-- ---------------------------------------------------------------------------
create or replace function public.socia_is_ws_owner(p_ws uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from public.workspaces w where w.id = p_ws and w.owner_id = auth.uid());
$fn$;

create or replace function public.socia_ws_role(p_ws uuid)
returns text language sql stable security definer set search_path = public as $fn$
  select case
    when exists (select 1 from public.workspaces w where w.id = p_ws and w.owner_id = auth.uid()) then 'owner'
    else (select m.role from public.workspace_members m where m.workspace_id = p_ws and m.user_id = auth.uid())
  end;
$fn$;

revoke all on function public.socia_is_ws_owner(uuid) from public;
grant execute on function public.socia_is_ws_owner(uuid) to authenticated, service_role;
revoke all on function public.socia_ws_role(uuid) from public;
grant execute on function public.socia_ws_role(uuid) to authenticated, service_role;

-- Seats in use for an owner: the owner plus every distinct member across
-- their workspaces. Internal (service role); the app shows the count from
-- rows the owner can already read.
create or replace function public.socia_seat_count(p_owner uuid)
returns integer language sql stable security definer set search_path = public as $fn$
  select 1 + count(distinct m.user_id)::integer
    from public.workspace_members m
    join public.workspaces w on w.id = m.workspace_id
   where w.owner_id = p_owner and m.user_id <> p_owner;
$fn$;
revoke all on function public.socia_seat_count(uuid) from public, anon, authenticated;
grant execute on function public.socia_seat_count(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Policies
-- ---------------------------------------------------------------------------
do $blk$
begin
  -- Members: a person sees their own memberships; the owner and admins see the workspace's list.
  drop policy if exists "workspace_members read" on public.workspace_members;
  create policy "workspace_members read" on public.workspace_members for select
    using (user_id = auth.uid() or public.socia_is_ws_owner(workspace_id) or public.socia_ws_role(workspace_id) = 'admin');
  -- Rows are created only by socia_accept_invite (service role). The owner may change roles.
  drop policy if exists "workspace_members owner update" on public.workspace_members;
  create policy "workspace_members owner update" on public.workspace_members for update
    using (public.socia_is_ws_owner(workspace_id)) with check (public.socia_is_ws_owner(workspace_id));
  -- The owner removes anyone; a person may leave. (An admin removing a member goes through the server.)
  drop policy if exists "workspace_members remove" on public.workspace_members;
  create policy "workspace_members remove" on public.workspace_members for delete
    using (public.socia_is_ws_owner(workspace_id) or user_id = auth.uid());

  -- Invites: owner and admins manage them. Nobody else can read a token.
  drop policy if exists "workspace_invites manage" on public.workspace_invites;
  create policy "workspace_invites manage" on public.workspace_invites for all
    using (public.socia_is_ws_owner(workspace_id) or public.socia_ws_role(workspace_id) = 'admin')
    with check (public.socia_is_ws_owner(workspace_id) or public.socia_ws_role(workspace_id) = 'admin');

  -- A member may read the workspace row they belong to (name, brand). Never update or delete it.
  drop policy if exists "workspaces member select" on public.workspaces;
  create policy "workspaces member select" on public.workspaces for select
    using (exists (select 1 from public.workspace_members m where m.workspace_id = workspaces.id and m.user_id = auth.uid()));
end $blk$;

-- ---------------------------------------------------------------------------
-- 4. Accept an invite, atomically, within the owner's seat limit (service role)
-- ---------------------------------------------------------------------------
-- Errors carry a stable message the app maps to copy:
--   invite_invalid | invite_revoked | invite_used | invite_expired | invite_owner | seat_limit
create or replace function public.socia_accept_invite(p_token text, p_user uuid, p_limit integer)
returns table (workspace_id uuid, role text)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_inv public.workspace_invites%rowtype;
  v_owner uuid;
  v_email text;
begin
  select * into v_inv from public.workspace_invites i where i.token = p_token for update;
  if not found then raise exception 'invite_invalid' using errcode = '22023'; end if;
  if v_inv.revoked_at is not null then raise exception 'invite_revoked' using errcode = '22023'; end if;
  if v_inv.accepted_at is not null then raise exception 'invite_used' using errcode = '22023'; end if;
  if v_inv.expires_at < now() then raise exception 'invite_expired' using errcode = '22023'; end if;

  select w.owner_id into v_owner from public.workspaces w where w.id = v_inv.workspace_id;
  if v_owner is null then raise exception 'invite_invalid' using errcode = '22023'; end if;
  if v_owner = p_user then raise exception 'invite_owner' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtext('seats:' || v_owner::text));

  if not exists (select 1 from public.workspace_members m where m.workspace_id = v_inv.workspace_id and m.user_id = p_user) then
    -- A person who already holds a seat in another of this owner's workspaces uses no new seat.
    if not exists (
      select 1 from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
       where w.owner_id = v_owner and m.user_id = p_user
    ) then
      if public.socia_seat_count(v_owner) >= p_limit then
        raise exception 'seat_limit' using errcode = '22023';
      end if;
    end if;
    select u.email into v_email from auth.users u where u.id = p_user;
    insert into public.workspace_members (workspace_id, user_id, role, email, invited_by)
      values (v_inv.workspace_id, p_user, v_inv.role, v_email, v_inv.created_by);
  end if;

  update public.workspace_invites set accepted_by = p_user, accepted_at = now() where id = v_inv.id;
  return query select v_inv.workspace_id, v_inv.role;
end $fn$;

revoke all on function public.socia_accept_invite(text, uuid, integer) from public, anon, authenticated;
grant execute on function public.socia_accept_invite(text, uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 4b. Invite preview for the landing page (any signed-in user)
-- ---------------------------------------------------------------------------
-- The person opening an invite link is not (yet) allowed to read the invite
-- row, so the landing page asks this function for the public facts: which
-- workspace, which role, and whether the link is still open. Knowing the
-- token is the only requirement; nothing beyond these five columns is exposed.
create or replace function public.socia_invite_preview(p_token text)
returns table (workspace_id uuid, workspace_name text, owner_id uuid, role text, status text)
language sql
stable
security definer
set search_path = public
as $fn$
  select i.workspace_id, w.name, w.owner_id, i.role,
         case when i.revoked_at is not null then 'revoked'
              when i.accepted_at is not null then 'used'
              when i.expires_at < now() then 'expired'
              else 'open' end
    from public.workspace_invites i
    join public.workspaces w on w.id = i.workspace_id
   where i.token = p_token and auth.uid() is not null;
$fn$;

revoke all on function public.socia_invite_preview(text) from public, anon;
grant execute on function public.socia_invite_preview(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Usage charged to the workspace owner (service role)
-- ---------------------------------------------------------------------------
-- Same contract as socia_consume_usage(), for a given user: when a member uses
-- Ask SOCIA or Content Studio inside someone's workspace, the server counts it
-- against the OWNER's allowance. The session-based function stays for owners.
create or replace function public.socia_consume_usage_for(p_user uuid, p_meter text, p_period_start date, p_limit integer)
returns table (used_count integer, allowed boolean)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_used integer;
begin
  if p_user is null then
    raise exception 'user required' using errcode = '22023';
  end if;

  insert into public.usage_counters (user_id, meter, period_start, used)
    values (p_user, p_meter, p_period_start, 0)
    on conflict (user_id, meter, period_start) do nothing;

  select uc.used into v_used
    from public.usage_counters uc
    where uc.user_id = p_user and uc.meter = p_meter and uc.period_start = p_period_start
    for update;

  if v_used >= p_limit then
    return query select v_used, false;
    return;
  end if;

  update public.usage_counters uc
    set used = uc.used + 1, updated_at = now()
    where uc.user_id = p_user and uc.meter = p_meter and uc.period_start = p_period_start;

  return query select v_used + 1, true;
end $fn$;

revoke all on function public.socia_consume_usage_for(uuid, text, date, integer) from public, anon, authenticated;
grant execute on function public.socia_consume_usage_for(uuid, text, date, integer) to service_role;
