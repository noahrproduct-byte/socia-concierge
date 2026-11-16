-- The first-week list and the posting streak (lib/perks). Run after
-- cancel-flow.sql. Safe to re-run.
--
-- Both give the same small perk: a few AI credits (added to the balance like a
-- top-up) and 30 days of extra room in the month's AI ceiling. What earned it
-- is noted on the row that already holds a person's invitation bonus and stay
-- boost, so reading a plan's allowances stays one small lookup, and only the
-- server can write it (supabase/referrals.sql takes insert, update and delete
-- away from browsers).
--   perk_until     the ceiling's extra room is on until then
--   first_week_at  when the first-week list was finished and rewarded (once)
--   streak_at      when a four-week streak was last rewarded

alter table public.referral_bonuses
  add column if not exists perk_until timestamptz,
  add column if not exists first_week_at timestamptz,
  add column if not exists streak_at timestamptz;
