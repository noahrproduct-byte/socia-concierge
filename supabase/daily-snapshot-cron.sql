-- OPTIONAL. The publisher job (socia-publisher, every 5 minutes) already
-- records each connected account's daily follower snapshot on the first run
-- after midnight UTC. Run this only if you want a dedicated job at a fixed
-- hour instead. Replace <CRON_SECRET> with the same value set in Vercel.
select cron.unschedule('socia-daily-snapshot')
  where exists (select 1 from cron.job where jobname = 'socia-daily-snapshot');

select cron.schedule(
  'socia-daily-snapshot',
  '5 0 * * *',
  $$
  select net.http_post(
    url := 'https://socia-concierge.vercel.app/api/sync/daily',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer <CRON_SECRET>',
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 55000
  );
  $$
);
