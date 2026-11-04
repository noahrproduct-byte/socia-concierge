-- Keep every connected Instagram account, Facebook Page and TikTok account
-- about 30 minutes fresh (lib/igSyncJob.ts). pg_cron calls /api/sync/instagram every 10
-- minutes; each run refreshes only the accounts last synced more than 30
-- minutes ago, oldest first. Vercel's Hobby cron can only run daily, so the
-- schedule lives here, like the publisher's.
--
-- Before running: replace <CRON_SECRET> below with the same value set in
-- Vercel (type it here, in the Supabase SQL editor). Safe to re-run.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('socia-instagram-sync')
  where exists (select 1 from cron.job where jobname = 'socia-instagram-sync');

select cron.schedule(
  'socia-instagram-sync',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://sociaos.com/api/sync/instagram',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer <CRON_SECRET>',
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 55000
  );
  $$
);
