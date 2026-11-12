-- The niche scan's scheduled job (lib/nicheScan): every two minutes SOCIA
-- runs the next steps of scans nobody is watching, closes scans that ran
-- out of time, and starts the weekly refresh for brands whose playbook is
-- older than a week. A scan someone is watching moves on its own (the card
-- polls /api/niche-scan), and a new scan is started straight away, so this
-- only carries scans the person walked away from. Needs intelligence.sql.
-- Idempotent: re-running replaces the schedule.
--
-- The job answers at once and keeps working in the background (up to 5
-- minutes), so the short HTTP timeout here is fine.
-- Replace <CRON_SECRET> with the project's CRON_SECRET (same as the publisher).

select cron.unschedule('socia-niche-scan')
  where exists (select 1 from cron.job where jobname = 'socia-niche-scan');

select cron.schedule(
  'socia-niche-scan',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://socia-concierge.vercel.app/api/jobs/niche-scan',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer <CRON_SECRET>',
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 20000
  );
  $$
);
