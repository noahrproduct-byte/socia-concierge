-- The monthly price each subscriber pays (2026-11-15), so a plan's credits can
-- follow the price: Pro customers on the full price from December 16 get more
-- credits than those who kept the launch price (lib/credits/config.ts).
--
-- The Stripe webhook writes it (lib/billing.ts). Like every other billing
-- column, nobody but SOCIA's server can change it: the protection trigger
-- below is billing.sql's, with the new column added.
--
-- Safe to run more than once. The app works before this runs (everyone gets
-- the launch-price credits until the column exists and is filled).

alter table public.profiles add column if not exists subscription_price_cents integer;

create or replace function public.socia_protect_plan_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.socia_is_privileged() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.plan := 'free';
    new.entitlement_overrides := null;
    new.stripe_customer_id := null;
    new.stripe_subscription_id := null;
    new.subscription_status := null;
    new.billing_interval := null;
    new.current_period_end := null;
    new.cancel_at := null;
    new.trial_end := null;
    new.subscription_price_cents := null;
  elsif new.plan is distinct from old.plan
     or new.entitlement_overrides is distinct from old.entitlement_overrides
     or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id
     or new.subscription_status is distinct from old.subscription_status
     or new.billing_interval is distinct from old.billing_interval
     or new.current_period_end is distinct from old.current_period_end
     or new.cancel_at is distinct from old.cancel_at
     or new.trial_end is distinct from old.trial_end
     or new.subscription_price_cents is distinct from old.subscription_price_cents then
    raise exception 'plan is managed by SOCIA billing' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists socia_protect_plan_columns on public.profiles;
create trigger socia_protect_plan_columns
  before insert or update on public.profiles
  for each row execute function public.socia_protect_plan_columns();
