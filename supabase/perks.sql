-- The first-week list and the posting streak (lib/perks). Run after
-- cancel-flow.sql. Safe to re-run.
--
-- Both give the same small perk for 30 days. It lives on the row that already
-- holds a person's invitation bonus and stay boost, so reading a plan's
-- allowances stays one small lookup, and only the server can write it
-- (supabase/referrals.sql takes insert, update and delete away from browsers).
--   perk_until     the perk is on until then
--   first_week_at  when the first-week list was finished and rewarded (once)
--   streak_at      when a four-week streak was last rewarded

alter table public.referral_bonuses
  add column if not exists perk_until timestamptz,
  add column if not exists first_week_at timestamptz,
  add column if not exists streak_at timestamptz;
