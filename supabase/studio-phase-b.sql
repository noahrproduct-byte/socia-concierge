-- Content Studio · Build from Clips, Phase B (Make This Video).
-- Adds the few columns the editable build and its export need. Run after
-- supabase/studio.sql. Safe to re-run.
alter table public.studio_builds add column if not exists regenerations integer not null default 0;
alter table public.studio_builds add column if not exists rendered_at timestamptz;
alter table public.studio_builds add column if not exists render_duration_s double precision;
