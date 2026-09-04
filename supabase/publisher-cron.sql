-- Run the SOCIA publisher every 5 minutes from Supabase (pg_cron + pg_net).
--
-- Vercel's Hobby plan allows one cron run per day with ±59 min precision, which
-- can't post at a scheduled time, so the schedule lives here instead. The job
-- calls /api/schedule/publish with the same CRON_SECRET set in Vercel.
--
-- Before running: replace <CRON_SECRET> below with the real value (type it here,
-- in the Supabase SQL editor; it never needs to leave your own dashboards).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('socia-publisher')
  where exists (select 1 from cron.job where jobname = 'socia-publisher');

select cron.schedule(
  'socia-publisher',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://socia-concierge.vercel.app/api/schedule/publish',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer <CRON_SECRET>',
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 55000
  );
  $$
);

-- Verify it's firing (after 5 minutes):
--   select jobname, status, start_time, return_message
--   from cron.job_run_details join cron.job using (jobid)
--   where jobname = 'socia-publisher' order by start_time desc limit 5;
-- The calendar's status strip also shows "Publisher last ran …" once it has.
