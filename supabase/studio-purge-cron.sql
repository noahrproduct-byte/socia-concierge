-- Nightly purge of expired Build-from-Clips footage (studio_clips.expires_at),
-- 03:30 UTC. Deletes the raw clip, its keyframes and audio from the private
-- bucket and marks the clip expired; the measured facts, transcript, clip
-- card, Content Yield and edit guides stay. Requires pg_cron + pg_net (already
-- used by publisher-cron.sql). Replace <CRON_SECRET> with the value in Vercel.
select cron.unschedule('socia-studio-purge')
  where exists (select 1 from cron.job where jobname = 'socia-studio-purge');

select cron.schedule(
  'socia-studio-purge',
  '30 3 * * *',
  $$
  select net.http_post(
    url := 'https://socia-concierge.vercel.app/api/jobs/studio-purge',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer <CRON_SECRET>',
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 55000
  );
  $$
);
