-- Every minute: move the AI Clipper and AI Studio jobs along
-- (/api/jobs/ai-poll). Requires pg_cron + pg_net (already used by
-- publisher-cron.sql). Replace <CRON_SECRET> with the value in Vercel.
select cron.unschedule('socia-ai-poll')
  where exists (select 1 from cron.job where jobname = 'socia-ai-poll');

select cron.schedule(
  'socia-ai-poll',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://socia-concierge.vercel.app/api/jobs/ai-poll',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer <CRON_SECRET>',
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 55000
  );
  $$
);
