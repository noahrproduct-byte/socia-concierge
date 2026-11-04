-- Videos made by the person's own Claude for their weekly Content Plan (lib/claudeWeek).
-- Claude reads the week, makes each video on the person's computer, uploads it
-- and submits it; SOCIA keeps it as a draft until the owner or an Admin
-- reviews it. Approving schedules it at its planned time; nothing posts before.
-- 1. scheduled_posts.plan_item_id: which post of the plan (weeklyPlan[].id) the
--    video was made for. plan_id already says which plan.
-- 2. review_status / review_note: waiting | approved | rejected, and the
--    owner's note when it goes back to Claude. Null on every other post.
-- Run after supabase/post-destinations.sql. Safe to re-run.

alter table public.scheduled_posts add column if not exists plan_item_id text;
alter table public.scheduled_posts add column if not exists review_status text;
alter table public.scheduled_posts add column if not exists review_note text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'scheduled_posts_review_status_check') then
    alter table public.scheduled_posts
      add constraint scheduled_posts_review_status_check check (review_status is null or review_status in ('waiting', 'approved', 'rejected'));
  end if;
end $$;

create index if not exists scheduled_posts_plan_item_idx on public.scheduled_posts (plan_id, plan_item_id) where plan_item_id is not null;
