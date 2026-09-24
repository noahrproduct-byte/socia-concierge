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
