-- Multi-platform publishing: one content item, many destination jobs.
-- Run in the Supabase SQL editor before deploying the composer. Idempotent.
--
-- scheduled_posts stays the parent "content item" (the calendar, dashboard and
-- shell keep reading it exactly as before). Every destination (Instagram
-- account, YouTube channel, ...) gets its own row in post_destinations with its
-- own status, schedule, external id and error, so one platform failing never
-- marks the others failed. Legacy rows with no destinations keep publishing
-- through the original Instagram path.

-- ---------------------------------------------------------------------------
-- 1. Parent additions
-- ---------------------------------------------------------------------------
-- Ordered media list (MediaItem[] in lib/publishing/types.ts). media_url /
-- media_path / media_type remain populated with the first item for legacy
-- readers.
alter table public.scheduled_posts add column if not exists media jsonb;
-- Set once when every destination has published (or the legacy row published).
alter table public.scheduled_posts add column if not exists published_at timestamptz;
-- Where the item was created: calendar | composer | quick | studio | plan
alter table public.scheduled_posts add column if not exists source text;

-- ---------------------------------------------------------------------------
-- 2. Destination jobs
-- ---------------------------------------------------------------------------
create table if not exists public.post_destinations (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.scheduled_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('instagram', 'youtube', 'facebook', 'tiktok')),
  -- Platform account id: ig_user_id, YouTube channel_id, Page id, TikTok open id.
  account_id text not null,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'scheduled', 'uploading', 'processing', 'published', 'failed', 'cancelled')),
  scheduled_at timestamptz,
  started_at timestamptz,
  published_at timestamptz,
  external_post_id text,
  external_container_id text,
  permalink text,
  error_code text,
  error_message text,
  retry_count integer not null default 0,
  next_retry_at timestamptz,
  -- Per-platform settings (caption override, title, tags, privacy, cover ...),
  -- shape per platform in lib/publishing/types.ts.
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists post_destinations_post_idx on public.post_destinations (post_id);
create index if not exists post_destinations_due_idx on public.post_destinations (status, scheduled_at);
create index if not exists post_destinations_user_idx on public.post_destinations (user_id, scheduled_at);
create index if not exists post_destinations_external_idx on public.post_destinations (platform, external_post_id);

alter table public.post_destinations enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'post_destinations' and policyname = 'post_destinations owner select') then
    create policy "post_destinations owner select" on public.post_destinations
      for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'post_destinations' and policyname = 'post_destinations owner insert') then
    create policy "post_destinations owner insert" on public.post_destinations
      for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'post_destinations' and policyname = 'post_destinations owner update') then
    create policy "post_destinations owner update" on public.post_destinations
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'post_destinations' and policyname = 'post_destinations owner delete') then
    create policy "post_destinations owner delete" on public.post_destinations
      for delete using (auth.uid() = user_id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Legacy parent index for attribution (published_media_id -> synced media)
-- ---------------------------------------------------------------------------
create index if not exists scheduled_posts_published_media_idx on public.scheduled_posts (published_media_id);
