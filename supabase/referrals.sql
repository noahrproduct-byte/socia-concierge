-- Invite a friend (lib/referrals). Safe to re-run.
--
-- Every account has a short code for its invite link. Someone who signs up
-- through that link is recorded once against the person who invited them, and
-- the invitation counts when the new person connects a social account. While
-- it counts (30 days), both people get a little more allowance
-- (lib/referrals/core.ts), kept in referral_bonuses so reading a plan's
-- allowances needs one small lookup.
--
-- Everything here is written by the server only (the service role). A signed-in
-- person can read their own rows and nothing else: nobody can give themselves
-- a bonus, claim someone else's code after the fact, or see who invited whom
-- beyond their own invitations.

create table if not exists public.referral_codes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code text not null unique check (code ~ '^[a-z0-9]{6,12}$'),
  created_at timestamptz not null default now()
);

-- One row per invited person: a person is invited by at most one account.
create table if not exists public.referrals (
  referred_id uuid primary key references auth.users (id) on delete cascade,
  referrer_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- When the invited person connected a social account; null until then.
  qualified_at timestamptz,
  constraint referrals_not_self check (referrer_id <> referred_id)
);
create index if not exists referrals_referrer_idx on public.referrals (referrer_id, qualified_at);

-- What a person currently has from invitations: how many count right now
-- (0 to 5), until when, and whether any invitation is still waiting to count.
create table if not exists public.referral_bonuses (
  user_id uuid primary key references auth.users (id) on delete cascade,
  active integer not null default 0 check (active between 0 and 5),
  until timestamptz,
  pending boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;
alter table public.referral_bonuses enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'referral_codes' and policyname = 'referral_codes owner select') then
    create policy "referral_codes owner select" on public.referral_codes for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'referrals' and policyname = 'referrals own select') then
    create policy "referrals own select" on public.referrals for select using (auth.uid() = referrer_id or auth.uid() = referred_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'referral_bonuses' and policyname = 'referral_bonuses owner select') then
    create policy "referral_bonuses owner select" on public.referral_bonuses for select using (auth.uid() = user_id);
  end if;
end $$;

-- No insert, update or delete policy on any of the three, and the grants are
-- taken away as well: only the server writes them.
revoke all on public.referral_codes from anon;
revoke all on public.referrals from anon;
revoke all on public.referral_bonuses from anon;
revoke insert, update, delete on public.referral_codes from authenticated;
revoke insert, update, delete on public.referrals from authenticated;
revoke insert, update, delete on public.referral_bonuses from authenticated;
