-- Content Studio · Build from Clips (Phase A).
-- Raw clips live in a PRIVATE bucket with a retention date; what SOCIA
-- learned about them (measured facts, transcript, clip card), the batch's
-- Content Yield and each build (EDL + edit guide) live in three tables and
-- outlive the footage. Run after workspaces.sql and plans-and-usage.sql:
-- Dashboard → SQL Editor → New query → paste → Run. Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Private source bucket. Objects are namespaced by the UPLOADER's auth uid
--    (first path segment) exactly like scheduled-media, but nothing is public:
--    the app reads them through short-lived signed URLs.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('studio-sources', 'studio-sources', false)
  on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Studio sources: owner insert') then
    create policy "Studio sources: owner insert" on storage.objects for insert to authenticated
      with check (bucket_id = 'studio-sources' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Studio sources: owner select') then
    create policy "Studio sources: owner select" on storage.objects for select to authenticated
      using (bucket_id = 'studio-sources' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Studio sources: owner update') then
    create policy "Studio sources: owner update" on storage.objects for update to authenticated
      using (bucket_id = 'studio-sources' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Studio sources: owner delete') then
    create policy "Studio sources: owner delete" on storage.objects for delete to authenticated
      using (bucket_id = 'studio-sources' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Projects: one batch of raw clips, owned by the workspace OWNER (user_id)
--    and scoped to a Brand Workspace. created_by is the person who uploaded
--    (an invited admin may differ from the owner).
-- ---------------------------------------------------------------------------
create table if not exists public.studio_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  title text,
  -- collecting | understanding | ready | failed
  status text not null default 'collecting',
  -- Live job state while understanding: {stage, done, total, ...}. Null otherwise.
  progress jsonb,
  -- Pass-2 batch summary (what the clips are about, as a whole).
  batch jsonb,
  -- Validated Content Yield: opportunities with evidence + what was rejected and why.
  yield jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Clips: one raw file. The footage (source_path, frames, audio_path) expires
--    at expires_at and is purged by /api/jobs/studio-purge; the measured facts,
--    transcript and clip card are kept so projects remain readable.
-- ---------------------------------------------------------------------------
create table if not exists public.studio_clips (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.studio_projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  position integer not null default 0,
  -- Content fingerprint (size + sampled bytes), for duplicate detection and
  -- reusing analysis across projects. Not a full-file hash.
  fingerprint text not null,
  name text not null,
  mime text,
  bytes bigint not null default 0,
  duration_s double precision,
  width integer,
  height integer,
  -- The file's own modified time, as the browser reported it. A chronology
  -- hint only; never shown as "recorded on".
  recorded_at timestamptz,
  source_path text,
  -- [{t, path}] keyframes (JPEG) in the bucket
  frames jsonb,
  -- 16 kHz mono WAV in the bucket, for transcription
  audio_path text,
  -- Measured visual/audio facts (lib/studioClips/facts.ts)
  facts jsonb,
  -- Word-level transcript (lib/transcribe)
  transcript jsonb,
  -- Pass-1 clip card
  card jsonb,
  -- registered | uploaded | ready | failed | expired
  status text not null default 'registered',
  error text,
  expires_at timestamptz,
  purged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. Builds: one per opportunity in a project. The EDL is the single edit
--    model; the edit guide is rendered from it (Phase A), the Player renders
--    it (Phase B). edl_history holds previous versions for undo.
-- ---------------------------------------------------------------------------
create table if not exists public.studio_builds (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.studio_projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  opportunity_idx integer not null,
  edl jsonb not null,
  edl_history jsonb not null default '[]'::jsonb,
  guide jsonb not null,
  caption text,
  -- Phase B
  render_path text,
  render_status text,
  post_id uuid references public.scheduled_posts (id) on delete set null,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, opportunity_idx)
);

create index if not exists studio_projects_owner_idx on public.studio_projects (user_id, workspace_id, updated_at desc);
create index if not exists studio_clips_project_idx on public.studio_clips (project_id, position);
create index if not exists studio_clips_fingerprint_idx on public.studio_clips (user_id, fingerprint);
create index if not exists studio_clips_expiry_idx on public.studio_clips (expires_at) where purged_at is null;
create index if not exists studio_builds_project_idx on public.studio_builds (project_id);

-- ---------------------------------------------------------------------------
-- 5. RLS: the owner's own session reads and writes their rows. Invited team
--    members act through the service role (lib/context.ts), which bypasses RLS.
-- ---------------------------------------------------------------------------
alter table public.studio_projects enable row level security;
alter table public.studio_clips enable row level security;
alter table public.studio_builds enable row level security;

do $$
declare t text;
begin
  foreach t in array array['studio_projects', 'studio_clips', 'studio_builds'] loop
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t || ' owner select') then
      execute format('create policy %I on public.%I for select using (auth.uid() = user_id)', t || ' owner select', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t || ' owner insert') then
      execute format('create policy %I on public.%I for insert with check (auth.uid() = user_id)', t || ' owner insert', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t || ' owner update') then
      execute format('create policy %I on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t || ' owner update', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t || ' owner delete') then
      execute format('create policy %I on public.%I for delete using (auth.uid() = user_id)', t || ' owner delete', t);
    end if;
  end loop;
end $$;
