-- Cancelling a plan (lib/retention). Run after referrals.sql. Safe to re-run.
--
-- 1. cancel_feedback: why a person started to cancel and what they chose. One
--    row each time someone finishes the two questions. Nobody can read or
--    write it from a browser; only SOCIA's server does (the service role).
-- 2. referral_bonuses gains the "stay" boost: until when it is on, and when it
--    was last given, so it is offered at most once every 180 days. It lives on
--    this row so reading a plan's allowances stays one small lookup.

create table if not exists public.cancel_feedback (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  plan text not null,
  reason text not null check (reason in ('too_expensive', 'not_using', 'missing_feature', 'results', 'hard_to_use', 'switching', 'temporary', 'other')),
  detail text check (detail is null or char_length(detail) <= 500),
  -- stayed: took the offer or kept the plan. continued: went on to Stripe's cancel page.
  outcome text not null check (outcome in ('stayed', 'continued')),
  created_at timestamptz not null default now()
);
create index if not exists cancel_feedback_time_idx on public.cancel_feedback (created_at desc);
create index if not exists cancel_feedback_user_idx on public.cancel_feedback (user_id, created_at desc);

alter table public.cancel_feedback enable row level security;
-- No policies at all: closed to every signed-in and signed-out session.
revoke all on public.cancel_feedback from anon;
revoke all on public.cancel_feedback from authenticated;

alter table public.referral_bonuses
  add column if not exists boost_until timestamptz,
  add column if not exists boost_given_at timestamptz;
