-- Your playlist: sounds a person dropped into the editor (saved from
-- Instagram, YouTube or anywhere else to their device first), trimmed to the
-- part they want, kept to use in any video (2026-11-15; replaces the tracks
-- SOCIA used to make). The file itself lives in the studio-sources bucket under
-- the uploader's own folder (<uploader uid>/library/music/<id>.<ext>), which
-- the bucket's owner policies in supabase/studio.sql already allow.
create table if not exists public.studio_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  name text not null,
  -- the file it was cut from, for the person's own reference
  source_name text,
  path text not null,
  duration_s double precision not null default 0,
  bytes bigint not null default 0,
  -- set once the browser has uploaded the file; rows never confirmed are swept
  ready boolean not null default false,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists studio_tracks_owner on public.studio_tracks (user_id, workspace_id, created_at desc);
alter table public.studio_tracks enable row level security;
do $$
declare t text := 'studio_tracks';
begin
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
end $$;
