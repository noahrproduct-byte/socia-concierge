-- Indexes for the queries that get slow as accounts and posts grow
-- (2026-11-17 scale check). Safe to run more than once, and safe on a database
-- where some of these tables do not exist yet: each index is made only when
-- its table and columns are there. Nothing is changed or removed.
--
-- Run it once in the Supabase SQL editor. The tables are small today, so each
-- index builds in well under a second.

do $$
declare
  r record;
begin
  for r in
    select * from (values
      -- Snapshot checks made by platform and account, without the owner.
      ('platform_snapshots',   'platform_snapshots_account_day_idx',   array['platform','account_id','day'],
       'create index if not exists platform_snapshots_account_day_idx on public.platform_snapshots (platform, account_id, day)'),
      -- "Who already has today''s row" in one query.
      ('account_snapshots',    'account_snapshots_day_idx',            array['day','user_id','ig_user_id'],
       'create index if not exists account_snapshots_day_idx on public.account_snapshots (day, user_id, ig_user_id)'),
      -- Studio cuts listed by owner, newest first.
      ('studio_builds',        'studio_builds_user_idx',               array['user_id','created_at'],
       'create index if not exists studio_builds_user_idx on public.studio_builds (user_id, created_at desc)'),
      -- The job queue and the "ran recently" checks.
      ('intelligence_jobs',    'intelligence_jobs_open_idx',           array['kind','created_at','status'],
       'create index if not exists intelligence_jobs_open_idx on public.intelligence_jobs (kind, created_at) where status in (''queued'', ''running'')'),
      ('intelligence_jobs',    'intelligence_jobs_finished_idx',       array['kind','status','finished_at'],
       'create index if not exists intelligence_jobs_finished_idx on public.intelligence_jobs (kind, status, finished_at)'),
      -- Links followed when a post, a plan or a generation job is deleted.
      ('plan_tasks',           'plan_tasks_post_idx',                  array['post_id'],
       'create index if not exists plan_tasks_post_idx on public.plan_tasks (post_id) where post_id is not null'),
      ('studio_builds',        'studio_builds_post_idx',               array['post_id'],
       'create index if not exists studio_builds_post_idx on public.studio_builds (post_id) where post_id is not null'),
      ('clips',                'clips_post_only_idx',                  array['post_id'],
       'create index if not exists clips_post_only_idx on public.clips (post_id) where post_id is not null'),
      ('scheduled_posts',      'scheduled_posts_plan_idx',             array['plan_id'],
       'create index if not exists scheduled_posts_plan_idx on public.scheduled_posts (plan_id) where plan_id is not null'),
      ('generations',          'generations_job_idx',                  array['job_id'],
       'create index if not exists generations_job_idx on public.generations (job_id)'),
      -- The unread count on the bell, read on every page.
      ('alert_events',         'alert_events_unread_idx',              array['user_id','workspace_id','read_at','dismissed_at'],
       'create index if not exists alert_events_unread_idx on public.alert_events (user_id, workspace_id) where read_at is null and dismissed_at is null'),
      -- "Oldest first" picks made by the scheduled jobs.
      ('niche_trends',         'niche_trends_updated_idx',             array['updated_at'],
       'create index if not exists niche_trends_updated_idx on public.niche_trends (updated_at)'),
      ('instagram_connections','instagram_connections_synced_idx',     array['last_synced_at'],
       'create index if not exists instagram_connections_synced_idx on public.instagram_connections (last_synced_at) where last_synced_at is not null')
    ) as t(tbl, idx, cols, ddl)
  loop
    if to_regclass('public.' || r.tbl) is null then
      raise notice 'skipped %: table % does not exist yet', r.idx, r.tbl;
    elsif exists (
      select 1 from unnest(r.cols) c
      where not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = r.tbl and column_name = c
      )
    ) then
      raise notice 'skipped %: a column is missing on %', r.idx, r.tbl;
    else
      execute r.ddl;
    end if;
  end loop;
end $$;
