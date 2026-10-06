-- Weekly Content Plan: every Monday SOCIA builds the coming week's plan for
-- each owner on Starter and up (one plan credit each) and leaves a "plan is
-- ready" alert in the bell. Idempotent: re-running replaces the schedule.
--
-- 09:00 UTC Monday = 4am Central, so the plan is waiting first thing. The job
-- answers at once and keeps working in the background (up to 5 minutes), so
-- the short HTTP timeout here is fine.
-- Replace <CRON_SECRET> with the project's CRON_SECRET (same as the publisher).

select cron.unschedule('socia-weekly-plan')
  where exists (select 1 from cron.job where jobname = 'socia-weekly-plan');

select cron.schedule(
  'socia-weekly-plan',
  '0 9 * * 1',
  $$
  select net.http_post(
    url := 'https://socia-concierge.vercel.app/api/jobs/weekly-plan',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer <CRON_SECRET>',
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 20000
  );
  $$
);
