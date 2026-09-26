-- TikTok account connection (Login Kit, OAuth 2.0). One row per SOCIA user.
-- Tokens are server-only: RLS lets the owner read/write their row through the
-- user client, and nothing here is ever sent to the browser except the public
-- profile summary columns the Settings card shows.
--
-- TikTok access tokens live 24 h; refresh tokens live 365 d. lib/tiktokData.ts
-- refreshes on read when token_expires_at is near.

create table if not exists public.tiktok_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
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

-- ---------------------------------------------------------------------------
-- The plan-downgrade "keep these accounts" function must know this table so a
-- TikTok account can be kept or paused like the others. Same body as in
-- plans-and-usage.sql (kept in sync); run either file after the other safely.
-- ---------------------------------------------------------------------------
create or replace function public.socia_apply_plan_keep(
  p_user uuid,
  p_accounts text[],
  p_competitors text[],
  p_account_limit integer,
  p_competitor_limit integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_bad integer;
  v_first text;
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text));

  if p_accounts is not null then
    if coalesce(array_length(p_accounts, 1), 0) > p_account_limit then
      raise exception 'more accounts than the plan allows' using errcode = '22023';
    end if;

    select count(*) into v_bad
      from unnest(p_accounts) as k
      where not exists (select 1 from public.instagram_connections c where c.user_id = p_user and 'instagram:' || c.ig_user_id = k)
        and not exists (select 1 from public.facebook_connections c where c.user_id = p_user and 'facebook:' || c.page_id = k)
        and not exists (select 1 from public.youtube_connections c where c.user_id = p_user and 'youtube:' || c.channel_id = k)
        and not exists (select 1 from public.tiktok_connections c where c.user_id = p_user and 'tiktok:' || c.open_id = k);
    if v_bad > 0 then
      raise exception 'unknown account' using errcode = '22023';
    end if;

    update public.instagram_connections c
      set plan_suspended_at = case when 'instagram:' || c.ig_user_id = any(p_accounts) then null else coalesce(c.plan_suspended_at, v_now) end
      where c.user_id = p_user;
    update public.facebook_connections c
      set plan_suspended_at = case when 'facebook:' || c.page_id = any(p_accounts) then null else coalesce(c.plan_suspended_at, v_now) end
      where c.user_id = p_user and c.page_id is not null;
    update public.youtube_connections c
      set plan_suspended_at = case when 'youtube:' || c.channel_id = any(p_accounts) then null else coalesce(c.plan_suspended_at, v_now) end
      where c.user_id = p_user;
    update public.tiktok_connections c
      set plan_suspended_at = case when 'tiktok:' || c.open_id = any(p_accounts) then null else coalesce(c.plan_suspended_at, v_now) end
      where c.user_id = p_user and c.open_id is not null;

    -- The app reads Instagram through the one is_active row; make sure it is a kept one.
    if not exists (select 1 from public.instagram_connections c where c.user_id = p_user and c.is_active and c.plan_suspended_at is null) then
      select c.ig_user_id into v_first
        from public.instagram_connections c
        where c.user_id = p_user and c.plan_suspended_at is null
        order by c.connected_at
        limit 1;
      if v_first is not null then
        update public.instagram_connections set is_active = false where user_id = p_user;
        update public.instagram_connections set is_active = true where user_id = p_user and ig_user_id = v_first;
      end if;
    end if;
  end if;

  if p_competitors is not null then
    if coalesce(array_length(p_competitors, 1), 0) > p_competitor_limit then
      raise exception 'more competitors than the plan allows' using errcode = '22023';
    end if;
    update public.tracked_competitors t
      set is_active = (t.platform || ':' || t.handle = any(p_competitors))
      where t.user_id = p_user;
  end if;
end $$;

revoke all on function public.socia_apply_plan_keep(uuid, text[], text[], integer, integer) from public, anon, authenticated;
grant execute on function public.socia_apply_plan_keep(uuid, text[], text[], integer, integer) to service_role;
