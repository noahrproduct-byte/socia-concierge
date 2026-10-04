-- Stripe billing: the subscription state SOCIA mirrors from Stripe webhooks.
-- Idempotent; safe to re-run. Run AFTER plans-and-usage.sql (it extends the
-- plan-column trigger defined there).
--
-- The source of truth for a paid plan is Stripe. The webhook (service role)
-- writes these columns; a browser session can read its own row and nothing
-- else, exactly like profiles.plan.

alter table public.profiles add column if not exists stripe_customer_id text;
alter table public.profiles add column if not exists stripe_subscription_id text;
alter table public.profiles add column if not exists subscription_status text;
alter table public.profiles add column if not exists billing_interval text;
alter table public.profiles add column if not exists current_period_end timestamptz;
alter table public.profiles add column if not exists cancel_at timestamptz;
alter table public.profiles add column if not exists trial_end timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_billing_interval_check') then
    alter table public.profiles
      add constraint profiles_billing_interval_check check (billing_interval is null or billing_interval in ('month', 'year'));
  end if;
end $$;

create unique index if not exists profiles_stripe_customer_id_key
  on public.profiles (stripe_customer_id) where stripe_customer_id is not null;

-- plan, overrides AND the billing columns are managed by SOCIA billing only.
create or replace function public.socia_protect_plan_columns()
returns trigger
language plpgsql
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
  elsif new.plan is distinct from old.plan
     or new.entitlement_overrides is distinct from old.entitlement_overrides
     or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id
     or new.subscription_status is distinct from old.subscription_status
     or new.billing_interval is distinct from old.billing_interval
     or new.current_period_end is distinct from old.current_period_end
     or new.cancel_at is distinct from old.cancel_at
     or new.trial_end is distinct from old.trial_end then
    raise exception 'plan is managed by SOCIA billing' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists socia_protect_plan_columns on public.profiles;
create trigger socia_protect_plan_columns
  before insert or update on public.profiles
  for each row execute function public.socia_protect_plan_columns();

-- Every Stripe event is applied once. Stripe retries deliveries; a second
-- copy of an event id is acknowledged and skipped.
create table if not exists public.billing_events (
  id text primary key,
  type text not null,
  user_id uuid,
  received_at timestamptz not null default now()
);
alter table public.billing_events enable row level security;
-- No policies on purpose: only the service role (webhook) reads or writes it.
