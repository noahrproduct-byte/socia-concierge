-- Weekly Content Plan: every Sunday at 6 PM in each owner's own time zone,
-- SOCIA builds the coming week's plan for owners on Starter and up (one plan
-- credit each) and leaves a "plan is ready" alert in the bell. Idempotent:
-- re-running replaces the schedule (it used to run Mondays at 09:00 UTC).
--
-- Every 15 minutes from Sunday to Tuesday UTC: every time zone's Sunday
-- evening (and the catch-up until Monday noon) falls inside it, and each call
-- builds only the plans due at that moment (lib/weeklyPlanJob.ts). The job
-- answers at once and keeps working in the background (up to 5 minutes), so
-- the short HTTP timeout here is fine.
-- Replace <CRON_SECRET> with the project's CRON_SECRET (same as the publisher).

select cron.unschedule('socia-weekly-plan')
  where exists (select 1 from cron.job where jobname = 'socia-weekly-plan');

select cron.schedule(
  'socia-weekly-plan',
  '*/15 * * * 0,1,2',
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
