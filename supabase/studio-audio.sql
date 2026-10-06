-- Content Studio · Audio that works (Phase B.5).
-- One row per past post SOCIA looked at for sound: whether Instagram hid its
-- file (= licensed/library music, documented behaviour), its results, and the
-- measured features when the file was available and the browser analysed it.
-- Competitor rows come from Business Discovery; only derived numbers are kept,
-- never the media. Run after supabase/studio.sql. Safe to re-run.
create table if not exists public.audio_media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  -- own | competitor
  source text not null,
  -- Instagram user id (own) or competitor handle
  account_key text not null,
  account_label text not null,
  media_id text not null,
  -- Instagram's (expiring) CDN link, present only when the file is public
  media_url text,
  permalink text,
  posted_at timestamptz,
  media_type text,
  has_media_url boolean not null default false,
  interactions integer,
  views integer,
  -- lib/audio/features.ts AudioFeatures
  features jsonb,
  error text,
  analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, media_id)
);

create index if not exists audio_media_owner_idx on public.audio_media (user_id, workspace_id, source);

alter table public.audio_media enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='audio_media' and policyname='audio_media owner select') then
    create policy "audio_media owner select" on public.audio_media for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='audio_media' and policyname='audio_media owner insert') then
    create policy "audio_media owner insert" on public.audio_media for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='audio_media' and policyname='audio_media owner update') then
    create policy "audio_media owner update" on public.audio_media for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='audio_media' and policyname='audio_media owner delete') then
    create policy "audio_media owner delete" on public.audio_media for delete using (auth.uid() = user_id);
  end if;
end $$;
