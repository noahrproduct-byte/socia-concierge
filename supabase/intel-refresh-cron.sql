-- Scheduled intelligence refresh: every 4 hours SOCIA re-runs its detectors
-- for the brands whose findings weren't refreshed in the last 20 hours, so
-- each brand is refreshed about once a day (lib/intel/dailyRun.ts). No AI
-- call; YouTube reads are capped per run. Needs intelligence.sql first.
-- Idempotent: re-running replaces the schedule.
--
-- The job answers at once and keeps working in the background (up to 5
-- minutes), so the short HTTP timeout here is fine.
-- Replace <CRON_SECRET> with the project's CRON_SECRET (same as the publisher).

select cron.unschedule('socia-intel-refresh')
  where exists (select 1 from cron.job where jobname = 'socia-intel-refresh');

select cron.schedule(
  'socia-intel-refresh',
  '15 */4 * * *',
  $$
  select net.http_post(
    url := 'https://socia-concierge.vercel.app/api/jobs/intel-refresh',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer <CRON_SECRET>',
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 20000
  );
  $$
);
