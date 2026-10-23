-- Security hardening (2026-10-22 audit). Run in the Supabase SQL editor AFTER
-- deploying the code from the same pull request: the code stops writing these
-- rows from a browser session first, then this file stops the database from
-- accepting such writes. Idempotent; safe to run again.
--
-- Depends on: schema.sql, post-destinations.sql, workspaces.sql,
-- youtube-connections.sql, tiktok-connections.sql, alerts.sql/approvals.sql,
-- ai-assistants.sql, plans-and-usage.sql (socia_is_privileged).
--
-- Why each section exists is written next to it. Nothing here deletes data.

-- ---------------------------------------------------------------------------
-- 1. Storage: nobody may LIST another customer's files.
--    The old "public read" select policy had no owner condition, so anyone
--    with the public anon key could list every folder in scheduled-media and
--    learn every customer's file names and post ids. The bucket stays public
--    (Instagram and Facebook fetch media by URL), and public URLs keep
--    working: /object/public/ does not consult these policies.
-- ---------------------------------------------------------------------------
drop policy if exists "Scheduled media: public read" on storage.objects;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Scheduled media: owner read') then
    create policy "Scheduled media: owner read" on storage.objects for select to authenticated
      using (bucket_id = 'scheduled-media' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;

-- Only media may be stored in the public bucket: no HTML, SVG or scripts that
-- would render from the storage domain. application/octet-stream stays
-- allowed because some browsers send it for video files with no known type;
-- it is served as a download, never rendered.
update storage.buckets
   set allowed_mime_types = array[
     'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
     'video/*', 'audio/*', 'application/octet-stream'
   ]
 where id = 'scheduled-media';

-- ---------------------------------------------------------------------------
-- 2. A destination may only point at the caller's OWN post.
--    The old policies checked only user_id, so a customer could attach a
--    destination (their own account) to someone else's post id; the publisher
--    then published the victim's content on the attacker's account and
--    rewrote the victim's post status. The publisher also checks this now.
-- ---------------------------------------------------------------------------
drop policy if exists "post_destinations owner insert" on public.post_destinations;
drop policy if exists "post_destinations owner update" on public.post_destinations;

create policy "post_destinations owner insert" on public.post_destinations
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.scheduled_posts p where p.id = post_id and p.user_id = auth.uid())
  );

create policy "post_destinations owner update" on public.post_destinations
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.scheduled_posts p where p.id = post_id and p.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 3. Workspaces: a browser session may create only the FIRST (default)
--    workspace. Every further workspace goes through socia_create_workspace
--    (service role), which enforces the plan's workspace limit. Before, a
--    direct REST insert skipped the limit.
-- ---------------------------------------------------------------------------
-- Security invoker on purpose: socia_is_privileged() reads current_user, which
-- inside a security definer function is always the owner (postgres), so a
-- definer guard would wave every browser write through.
create or replace function public.socia_guard_workspace_insert()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.socia_is_privileged() then
    return new;
  end if;
  if exists (select 1 from public.workspaces w where w.owner_id = new.owner_id) then
    raise exception 'Create workspaces through SOCIA (plan limits apply).' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists socia_guard_workspace_insert on public.workspaces;
create trigger socia_guard_workspace_insert
  before insert on public.workspaces
  for each row execute function public.socia_guard_workspace_insert();

-- ---------------------------------------------------------------------------
-- 4. Connected accounts: only SOCIA's server may add one, or change which
--    account, owner or workspace a row belongs to. Connecting goes through
--    the OAuth callbacks, which check the plan's account limit; a browser
--    session could previously insert a saved row back after reconnecting
--    another account and so hold more accounts than the plan allows.
--    Token refreshes and syncs (which update tokens and cached data on the
--    same row) are unaffected.
-- ---------------------------------------------------------------------------
-- Security invoker on purpose: socia_is_privileged() reads current_user, which
-- inside a security definer function is always the owner (postgres), so a
-- definer guard would wave every browser write through.
create or replace function public.socia_guard_connection_write()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  identity_col text := tg_argv[0];
begin
  if public.socia_is_privileged() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    raise exception 'Connect accounts through SOCIA.' using errcode = '42501';
  end if;
  if new.user_id is distinct from old.user_id
     or (to_jsonb(new) ->> 'workspace_id') is distinct from (to_jsonb(old) ->> 'workspace_id')
     or (to_jsonb(new) ->> identity_col) is distinct from (to_jsonb(old) ->> identity_col) then
    raise exception 'Connect accounts through SOCIA.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists socia_guard_connection_write on public.instagram_connections;
create trigger socia_guard_connection_write
  before insert or update on public.instagram_connections
  for each row execute function public.socia_guard_connection_write('ig_user_id');

drop trigger if exists socia_guard_connection_write on public.facebook_connections;
create trigger socia_guard_connection_write
  before insert or update on public.facebook_connections
  for each row execute function public.socia_guard_connection_write('page_id');

drop trigger if exists socia_guard_connection_write on public.youtube_connections;
create trigger socia_guard_connection_write
  before insert or update on public.youtube_connections
  for each row execute function public.socia_guard_connection_write('channel_id');

drop trigger if exists socia_guard_connection_write on public.tiktok_connections;
create trigger socia_guard_connection_write
  before insert or update on public.tiktok_connections
  for each row execute function public.socia_guard_connection_write('open_id');

revoke all on function public.socia_guard_connection_write() from public;
revoke all on function public.socia_guard_workspace_insert() from public;

-- ---------------------------------------------------------------------------
-- 5. Alerts: a Member may mark an alert read or dismissed, nothing else.
--    The update policy had no column limit, so a Member could rewrite an
--    alert's text or redirect it away from the owner.
-- ---------------------------------------------------------------------------
revoke update on public.alert_events from authenticated;
grant update (read_at, dismissed_at) on public.alert_events to authenticated;

-- ---------------------------------------------------------------------------
-- 6. AI assistant housekeeping: app registrations nobody connected are
--    removed after 30 days (anyone may register one; nothing removed them).
-- ---------------------------------------------------------------------------
create or replace function public.socia_ai_cleanup()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.oauth_requests where expires_at < now() - interval '1 day';
  delete from public.oauth_codes where expires_at < now() - interval '1 day';
  delete from public.oauth_tokens where expires_at < now() - interval '7 days';
  delete from public.api_rate_counters where window_start < now() - interval '1 day';
  delete from public.ai_audit_log where at < now() - interval '180 days';
  delete from public.oauth_clients c
   where c.created_at < now() - interval '30 days'
     and not exists (select 1 from public.ai_connections a where a.client_id = c.client_id)
     and not exists (select 1 from public.oauth_requests r where r.client_id = c.client_id);
$$;

revoke all on function public.socia_ai_cleanup() from public;
grant execute on function public.socia_ai_cleanup() to service_role;

-- ---------------------------------------------------------------------------
-- 7. Facebook "choose a Page": the Page tokens move out of the row the
--    owner's browser can read (lib/facebookPending.ts) into a server-only
--    table, and tokens already stored in a pending list are removed.
-- ---------------------------------------------------------------------------
create table if not exists public.facebook_pending_tokens (
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_key text not null,
  page_id text not null,
  access_token text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, workspace_key, page_id)
);
alter table public.facebook_pending_tokens enable row level security;
revoke all on public.facebook_pending_tokens from anon, authenticated;

update public.facebook_connections
   set pending_pages = (
     select coalesce(jsonb_agg(e - 'access_token'), '[]'::jsonb)
       from jsonb_array_elements(pending_pages) e
   )
 where pending_pages is not null
   and jsonb_typeof(pending_pages) = 'array';

-- ---------------------------------------------------------------------------
-- 8. Function grants. Supabase grants EXECUTE on new public functions to anon
--    and authenticated directly, so "revoke ... from public" alone left
--    socia_rate_hit callable by anyone: a stranger could fill another user's
--    rate-limit counters and lock them out of features.
-- ---------------------------------------------------------------------------
revoke execute on function public.socia_rate_hit(text, integer, integer) from anon, authenticated;
revoke execute on function public.socia_ai_cleanup() from anon, authenticated;
revoke execute on function public.socia_guard_connection_write() from anon, authenticated;
revoke execute on function public.socia_guard_workspace_insert() from anon, authenticated;
-- Signed-out callers had it too (it refuses them, but they have no use for it).
revoke execute on function public.socia_consume_usage(text, date, integer) from anon;

-- ---------------------------------------------------------------------------
-- 9. A row's workspace must be one the caller owns. Without this a person who
--    knows another workspace's id could create rows in it (for a connection
--    table this blocked the real owner from ever connecting that platform).
--    The server writes guests' rows with the service role, which passes.
-- ---------------------------------------------------------------------------
-- Security invoker on purpose: socia_is_privileged() reads current_user, which
-- inside a security definer function is always the owner (postgres), so a
-- definer guard would wave every browser write through.
create or replace function public.socia_guard_workspace_fk()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  ws uuid := nullif(to_jsonb(new) ->> 'workspace_id', '')::uuid;
begin
  if public.socia_is_privileged() or ws is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and ws is not distinct from nullif(to_jsonb(old) ->> 'workspace_id', '')::uuid then
    return new;
  end if;
  if not exists (select 1 from public.workspaces w where w.id = ws and w.owner_id = auth.uid()) then
    raise exception 'That workspace is not yours.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.socia_guard_workspace_fk() from public, anon, authenticated;

do $blk$
declare
  t text;
begin
  foreach t in array array[
    'scheduled_posts', 'post_destinations', 'plans', 'comment_drafts',
    'instagram_connections', 'facebook_connections', 'youtube_connections', 'tiktok_connections',
    'studio_projects', 'studio_clips', 'studio_builds', 'audio_media', 'platform_snapshots',
    'tracked_competitors', 'discovered_content', 'discovery_runs'
  ] loop
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'workspace_id') then
      execute format('drop trigger if exists socia_guard_workspace_fk on public.%I', t);
      execute format('create trigger socia_guard_workspace_fk before insert or update on public.%I for each row execute function public.socia_guard_workspace_fk()', t);
    end if;
  end loop;
end $blk$;

-- ---------------------------------------------------------------------------
-- 10. Team: the owner may change a member's role, never which person or
--     workspace the row is (that would add someone without an invite).
-- ---------------------------------------------------------------------------
revoke update on public.workspace_members from authenticated;
grant update (role) on public.workspace_members to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Platform tokens are server-only. The browser (anon key, or a signed-in
--     session) gets no access at all to the tables that hold Instagram,
--     Facebook, YouTube and TikTok tokens: not even its own rows. SOCIA's
--     server reaches them with the service role (lib/supabase/privateTables.ts),
--     always filtered by the signed-in owner. Deploy that code first: before
--     it, the server read these tables with the person's session.
-- ---------------------------------------------------------------------------
do $blk$
declare
  t text;
begin
  foreach t in array array['instagram_connections', 'facebook_connections', 'youtube_connections', 'tiktok_connections', 'facebook_pending_tokens'] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on public.%I from anon, authenticated', t);
      execute format('grant all on public.%I to service_role', t);
    end if;
  end loop;
end $blk$;

-- ---------------------------------------------------------------------------
-- 12. Invites. An invite's token is the key to a seat, so:
--     - the owner sees, creates and cancels any invite in their workspaces;
--     - an Admin sees, creates and cancels Member invites only. Before, an
--       Admin could read the owner's Admin links, or insert an Admin invite
--       straight through REST (the app refuses that; the database didn't);
--     - nobody edits an invite after creating it except to cancel it (a
--       Member link could otherwise be turned into an Admin link).
--     Accepting runs on the server with the service role, unaffected.
-- ---------------------------------------------------------------------------
drop policy if exists "workspace_invites manage" on public.workspace_invites;
drop policy if exists "workspace_invites read" on public.workspace_invites;
drop policy if exists "workspace_invites create" on public.workspace_invites;
drop policy if exists "workspace_invites cancel" on public.workspace_invites;

create policy "workspace_invites read" on public.workspace_invites for select
  using (public.socia_is_ws_owner(workspace_id)
         or (role = 'member' and public.socia_ws_role(workspace_id) = 'admin'));
create policy "workspace_invites create" on public.workspace_invites for insert
  with check (created_by = auth.uid()
              and (public.socia_is_ws_owner(workspace_id)
                   or (role = 'member' and public.socia_ws_role(workspace_id) = 'admin')));
create policy "workspace_invites cancel" on public.workspace_invites for update
  using (public.socia_is_ws_owner(workspace_id)
         or (role = 'member' and public.socia_ws_role(workspace_id) = 'admin'))
  with check (public.socia_is_ws_owner(workspace_id)
              or (role = 'member' and public.socia_ws_role(workspace_id) = 'admin'));

revoke update, delete on public.workspace_invites from anon, authenticated;
grant update (revoked_at) on public.workspace_invites to authenticated;
