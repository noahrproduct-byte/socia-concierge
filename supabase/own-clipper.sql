-- SOCIA's own clipper (lib/clipper/socia.ts), run after ai-studio.sql. Safe to re-run.
--
-- SOCIA transcribes the uploaded video, picks the moments, and the person's
-- browser renders each clip (cut, 9:16 crop, captions). So a job keeps its
-- transcript and the stage it is at, and a clip keeps where it starts and ends
-- in the source, where the crop sits, and the post it became (what SOCIA
-- learns from).

alter table public.clip_jobs add column if not exists stage text null;
-- Words as [text, startMs, endMs] triples: the moments are cut and captioned from these.
alter table public.clip_jobs add column if not exists transcript jsonb null;

alter table public.clips add column if not exists start_ms integer null;
alter table public.clips add column if not exists end_ms integer null;
alter table public.clips add column if not exists hook text null;
alter table public.clips add column if not exists crop_x numeric(4,3) not null default 0.5;
alter table public.clips add column if not exists post_id uuid null references public.scheduled_posts (id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clips_crop_x_range') then
    alter table public.clips add constraint clips_crop_x_range check (crop_x >= 0 and crop_x <= 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'clips_range_order') then
    alter table public.clips add constraint clips_range_order check (start_ms is null or end_ms is null or (start_ms >= 0 and end_ms > start_ms));
  end if;
end $$;

create index if not exists clips_post_idx on public.clips (user_id, post_id) where post_id is not null;

-- Unused uploads: as before, plus the sources of SOCIA's own clipper jobs are
-- kept 14 days after the job, since the clips are rendered from them in the
-- browser and can be re-cropped and rendered again.
create or replace function public.socia_ai_media_stale_uploads(p_older_than interval default interval '1 day', p_limit integer default 100)
returns setof text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select o.name from storage.objects o
  where o.bucket_id = 'ai-media'
    and (o.name like '%/clipper-sources/%' or o.name like '%/studio-inputs/%')
    and o.created_at < now() - p_older_than
    and not exists (select 1 from public.clip_jobs j where j.source_path = o.name and j.status in ('queued', 'processing'))
    and not exists (select 1 from public.clip_jobs j where j.source_path = o.name and j.provider = 'socia' and j.created_at > now() - interval '14 days')
    and not exists (select 1 from public.generation_jobs g where g.input_image_path = o.name and g.status in ('queued', 'processing'))
  order by o.created_at
  limit greatest(1, least(p_limit, 500));
$$;
revoke all on function public.socia_ai_media_stale_uploads(interval, integer) from public, anon, authenticated;
grant execute on function public.socia_ai_media_stale_uploads(interval, integer) to service_role;
