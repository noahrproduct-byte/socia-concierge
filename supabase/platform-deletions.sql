-- Delete on platform: SOCIA keeps a post it deleted from Instagram, YouTube or
-- Facebook as a record, marked deleted, with the last numbers it saw. Run in
-- the Supabase SQL editor after rls-audit.sql (it uses its workspace guard). Idempotent.

-- ---------------------------------------------------------------------------
-- 1. Destinations SOCIA published: the deletion flag and the frozen result.
--    status stays 'published'; deleted_at is the mark. deleted_result holds the
--    last Measurement (lib/postResults.ts) taken just before the platform call,
--    or null when the platform never reported the post (never 0).
-- ---------------------------------------------------------------------------
alter table public.post_destinations
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users (id) on delete set null,
  add column if not exists deleted_result jsonb;

create index if not exists post_destinations_deleted_idx
  on public.post_destinations (user_id, deleted_at) where deleted_at is not null;

-- Legacy Instagram rows (no destination rows; published_media_id names the post).
alter table public.scheduled_posts
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users (id) on delete set null,
  add column if not exists deleted_result jsonb;

-- ---------------------------------------------------------------------------
-- 2. Facebook connection: the long-lived USER token (deleting Instagram media
--    needs it; the Page token stays in access_token), its expiry, and the
--    permission names Meta granted (from /me/permissions, names only).
-- ---------------------------------------------------------------------------
alter table public.facebook_connections
  add column if not exists user_access_token text,
  add column if not exists user_token_expires_at timestamptz,
  add column if not exists scopes text[];

-- ---------------------------------------------------------------------------
-- 3. The ledger: one row per deletion SOCIA performed, including Instagram
--    media SOCIA did not publish (the sync drops them from the snapshot, so
--    this row is the record). last_metrics: the raw counts as last synced plus
--    the frozen Measurement. platform_response: what the platform answered,
--    never a token. deleted_by is nullable so that removing a team member's
--    account never blocks on the ledger (on delete set null).
-- ---------------------------------------------------------------------------
create table if not exists public.platform_deletions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete set null,
  platform text not null check (platform in ('instagram', 'youtube', 'facebook', 'tiktok')),
  -- ig_user_id, YouTube channel_id, Page id, TikTok open id
  account_id text not null,
  -- IG media id, YouTube video id, Page post id
  external_id text not null,
  post_id uuid references public.scheduled_posts (id) on delete set null,
  destination_id uuid references public.post_destinations (id) on delete set null,
  deleted_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz not null default now(),
  permalink text,
  caption text,
  media_kind text,
  last_metrics jsonb,
  platform_response jsonb,
  unique (user_id, platform, external_id)
);

create index if not exists platform_deletions_user_idx on public.platform_deletions (user_id, deleted_at desc);
create index if not exists platform_deletions_post_idx on public.platform_deletions (post_id);

alter table public.platform_deletions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'platform_deletions' and policyname = 'platform_deletions owner select') then
    create policy "platform_deletions owner select" on public.platform_deletions
      for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'platform_deletions' and policyname = 'platform_deletions owner insert') then
    create policy "platform_deletions owner insert" on public.platform_deletions
      for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'platform_deletions' and policyname = 'platform_deletions owner update') then
    create policy "platform_deletions owner update" on public.platform_deletions
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Same guarantees as every per-brand table (security-hardening.sql,
--    rls-audit.sql): signed-out visitors get nothing, and a row may only name
--    a workspace its owner owns.
-- ---------------------------------------------------------------------------
revoke all on public.platform_deletions from anon;
drop trigger if exists socia_guard_workspace_fk on public.platform_deletions;
create trigger socia_guard_workspace_fk before insert or update on public.platform_deletions
  for each row execute function public.socia_guard_workspace_fk();
