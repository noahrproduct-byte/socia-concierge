-- Automatic comment replies: every 30 minutes SOCIA reads new comments for the
-- brands that turned automatic replies on, drafts replies, and sends the short
-- friendly ones (lib/commentAuto.ts). Needs comment-auto.sql first.
-- Idempotent: re-running replaces the schedule.
--
-- The job answers at once and keeps working in the background (up to 5
-- minutes), so the short HTTP timeout here is fine.
-- Replace <CRON_SECRET> with the project's CRON_SECRET (same as the publisher).

select cron.unschedule('socia-comment-replies')
  where exists (select 1 from cron.job where jobname = 'socia-comment-replies');

select cron.schedule(
  'socia-comment-replies',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://socia-concierge.vercel.app/api/jobs/comment-replies',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer <CRON_SECRET>',
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 20000
  );
  $$
);
