-- Plans, entitlements, usage metering and the downgrade model.
-- Run this in the Supabase SQL editor BEFORE deploying the code that uses it.
-- Safe to run more than once: every statement is guarded, so a re-run never
-- errors or leaves a lock behind.
--
-- Trust model: the plan, the paused-account flags, the competitor roster
-- writes and the usage counters are all decided by SOCIA's server, never by
-- the browser. Browser sessions (anon key + user JWT) can read their own rows
-- but cannot change the columns that carry a plan decision; those writes go
-- through the service role or the SECURITY DEFINER functions below.

-- ---------------------------------------------------------------------------
-- 0. Who is allowed to change plan-decided columns: the service role (SOCIA's
--    server) or the SQL editor. Everyone else is a browser session.
-- ---------------------------------------------------------------------------
create or replace function public.socia_is_privileged()
returns boolean
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
      or current_user in ('postgres', 'supabase_admin');
$$;

-- ---------------------------------------------------------------------------
-- 1. profiles.plan: four tiers, constrained, and locked.
--    Before this, the ordinary "update own profile" RLS policy let any
--    signed-in user set their own plan from the browser.
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists plan text not null default 'free';
alter table public.profiles add column if not exists entitlement_overrides jsonb;

update public.profiles set plan = 'free'
  where plan is null or plan not in ('free', 'starter', 'growth', 'pro');

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_plan_check') then
    alter table public.profiles
      add constraint profiles_plan_check check (plan in ('free', 'starter', 'growth', 'pro'));
  end if;
end $$;

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
  elsif new.plan is distinct from old.plan
     or new.entitlement_overrides is distinct from old.entitlement_overrides then
    raise exception 'plan is managed by SOCIA billing' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists socia_protect_plan_columns on public.profiles;
create trigger socia_protect_plan_columns
  before insert or update on public.profiles
  for each row execute function public.socia_protect_plan_columns();

-- ---------------------------------------------------------------------------
-- 2. Per-plan overrides: change a limit, meter or feature flag for a whole
--    plan without a deploy. Keys mirror lib/plans.ts; unknown keys are ignored.
--    Example: insert into plan_config_overrides (plan_id, meters)
--             values ('pro', '{"ask_socia": 900}');
-- ---------------------------------------------------------------------------
create table if not exists public.plan_config_overrides (
  plan_id text primary key check (plan_id in ('free', 'starter', 'growth', 'pro')),
  limits jsonb not null default '{}'::jsonb,
  meters jsonb not null default '{}'::jsonb,
  features jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.plan_config_overrides enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'plan_config_overrides' and policyname = 'plan_config_overrides read') then
    create policy "plan_config_overrides read" on public.plan_config_overrides
      for select to authenticated using (true);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Usage counters: one row per user, meter and period. Changed only through
--    socia_consume_usage() (row lock, so two concurrent requests cannot both
--    take the last slot) and socia_release_usage() (gives one unit back when
--    the AI call that consumed it failed). Users can read their own rows.
-- ---------------------------------------------------------------------------
create table if not exists public.usage_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  meter text not null,
  period_start date not null,
  used integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, meter, period_start)
);

alter table public.usage_counters enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'usage_counters' and policyname = 'usage_counters owner select') then
    create policy "usage_counters owner select" on public.usage_counters
      for select using (auth.uid() = user_id);
  end if;
end $$;

create or replace function public.socia_consume_usage(p_meter text, p_period_start date, p_limit integer)
returns table (used_count integer, allowed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_used integer;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  insert into public.usage_counters (user_id, meter, period_start, used)
    values (v_user, p_meter, p_period_start, 0)
    on conflict (user_id, meter, period_start) do nothing;

  select uc.used into v_used
    from public.usage_counters uc
    where uc.user_id = v_user and uc.meter = p_meter and uc.period_start = p_period_start
    for update;

  if v_used >= p_limit then
    return query select v_used, false;
    return;
  end if;

  update public.usage_counters uc
    set used = uc.used + 1, updated_at = now()
    where uc.user_id = v_user and uc.meter = p_meter and uc.period_start = p_period_start;

  return query select v_used + 1, true;
end $$;

revoke all on function public.socia_consume_usage(text, date, integer) from public;
grant execute on function public.socia_consume_usage(text, date, integer) to authenticated, service_role;

-- Give one unit back (never below zero). Called by the server when the model
-- call that consumed the unit failed, so an outage cannot spend an allowance.
create or replace function public.socia_release_usage(p_meter text, p_period_start date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_used integer;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  update public.usage_counters uc
    set used = greatest(uc.used - 1, 0), updated_at = now()
    where uc.user_id = v_user and uc.meter = p_meter and uc.period_start = p_period_start
    returning uc.used into v_used;
  return coalesce(v_used, 0);
end $$;

revoke all on function public.socia_release_usage(text, date) from public;
grant execute on function public.socia_release_usage(text, date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Downgrade model. Nothing is deleted when a plan shrinks: connections the
--    person did not choose to keep are paused (plan_suspended_at set) and
--    competitors beyond the cap are marked inactive. Both are reversible, and
--    both columns are locked so a browser session cannot flip them back.
-- ---------------------------------------------------------------------------
alter table public.instagram_connections add column if not exists plan_suspended_at timestamptz;
alter table public.facebook_connections add column if not exists plan_suspended_at timestamptz;

do $$
begin
  if to_regclass('public.youtube_connections') is not null then
    alter table public.youtube_connections add column if not exists plan_suspended_at timestamptz;
  end if;
end $$;

alter table public.tracked_competitors add column if not exists is_active boolean not null default true;

create or replace function public.socia_protect_pause_columns()
returns trigger
language plpgsql
as $$
begin
  if public.socia_is_privileged() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.plan_suspended_at := null;
  elsif new.plan_suspended_at is distinct from old.plan_suspended_at then
    raise exception 'paused accounts are managed by SOCIA billing' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.socia_protect_competitor_active()
returns trigger
language plpgsql
as $$
begin
  if public.socia_is_privileged() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_active := true;
  elsif new.is_active is distinct from old.is_active then
    raise exception 'competitor roster limits are managed by SOCIA billing' using errcode = '42501';
  end if;
  return new;
end $$;

do $$
begin
  drop trigger if exists socia_protect_pause_columns on public.instagram_connections;
  create trigger socia_protect_pause_columns
    before insert or update on public.instagram_connections
    for each row execute function public.socia_protect_pause_columns();

  drop trigger if exists socia_protect_pause_columns on public.facebook_connections;
  create trigger socia_protect_pause_columns
    before insert or update on public.facebook_connections
    for each row execute function public.socia_protect_pause_columns();

  if to_regclass('public.youtube_connections') is not null then
    execute 'drop trigger if exists socia_protect_pause_columns on public.youtube_connections';
    execute 'create trigger socia_protect_pause_columns before insert or update on public.youtube_connections for each row execute function public.socia_protect_pause_columns()';
  end if;

  drop trigger if exists socia_protect_competitor_active on public.tracked_competitors;
  create trigger socia_protect_competitor_active
    before insert or update on public.tracked_competitors
    for each row execute function public.socia_protect_competitor_active();
end $$;

-- Competitors are added only through the server (plan cap checked atomically
-- below), so the browser insert policy goes away. Reads and explicit removals
-- stay with the owner.
drop policy if exists "Users can add their own competitors" on public.tracked_competitors;

-- Atomic, plan-aware competitor add. Service role only: p_limit is trusted
-- because only SOCIA's server can call this.
create or replace function public.socia_add_competitor(p_user uuid, p_platform text, p_handle text, p_limit integer)
returns table (added boolean, already boolean, active_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active boolean;
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text));

  select t.is_active into v_active
    from public.tracked_competitors t
    where t.user_id = p_user and t.platform = p_platform and t.handle = p_handle;

  select count(*) into v_count
    from public.tracked_competitors t
    where t.user_id = p_user and t.is_active;

  if coalesce(v_active, false) then
    return query select false, true, v_count;
    return;
  end if;

  if v_count >= p_limit then
    return query select false, false, v_count;
    return;
  end if;

  insert into public.tracked_competitors (user_id, platform, handle, is_active)
    values (p_user, p_platform, p_handle, true)
    on conflict (user_id, platform, handle) do update set is_active = true;

  return query select true, false, v_count + 1;
end $$;

revoke all on function public.socia_add_competitor(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.socia_add_competitor(uuid, text, text, integer) to service_role;

-- Apply a "choose what to keep" decision after a downgrade. Service role only.
-- p_accounts: ids like 'instagram:<ig_user_id>', 'facebook:<page_id>',
-- 'youtube:<channel_id>'. p_competitors: 'platform:handle'. Pass null to
-- leave that group untouched. Everything not kept is paused, never deleted.
create or replace function public.socia_apply_plan_keep(
  p_user uuid,
  p_accounts text[],
  p_competitors text[],
  p_account_limit integer,
  p_competitor_limit integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_bad integer;
  v_first text;
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text));

  if p_accounts is not null then
    if coalesce(array_length(p_accounts, 1), 0) > p_account_limit then
      raise exception 'more accounts than the plan allows' using errcode = '22023';
    end if;

    select count(*) into v_bad
      from unnest(p_accounts) as k
      where not exists (select 1 from public.instagram_connections c where c.user_id = p_user and 'instagram:' || c.ig_user_id = k)
        and not exists (select 1 from public.facebook_connections c where c.user_id = p_user and 'facebook:' || c.page_id = k)
        and not exists (select 1 from public.youtube_connections c where c.user_id = p_user and 'youtube:' || c.channel_id = k);
    if v_bad > 0 then
      raise exception 'unknown account' using errcode = '22023';
    end if;

    update public.instagram_connections c
      set plan_suspended_at = case when 'instagram:' || c.ig_user_id = any(p_accounts) then null else coalesce(c.plan_suspended_at, v_now) end
      where c.user_id = p_user;
    update public.facebook_connections c
      set plan_suspended_at = case when 'facebook:' || c.page_id = any(p_accounts) then null else coalesce(c.plan_suspended_at, v_now) end
      where c.user_id = p_user and c.page_id is not null;
    update public.youtube_connections c
      set plan_suspended_at = case when 'youtube:' || c.channel_id = any(p_accounts) then null else coalesce(c.plan_suspended_at, v_now) end
      where c.user_id = p_user;

    -- The app reads Instagram through the one is_active row; make sure it is a kept one.
    if not exists (select 1 from public.instagram_connections c where c.user_id = p_user and c.is_active and c.plan_suspended_at is null) then
      select c.ig_user_id into v_first
        from public.instagram_connections c
        where c.user_id = p_user and c.plan_suspended_at is null
        order by c.connected_at
        limit 1;
      if v_first is not null then
        update public.instagram_connections set is_active = false where user_id = p_user;
        update public.instagram_connections set is_active = true where user_id = p_user and ig_user_id = v_first;
      end if;
    end if;
  end if;

  if p_competitors is not null then
    if coalesce(array_length(p_competitors, 1), 0) > p_competitor_limit then
      raise exception 'more competitors than the plan allows' using errcode = '22023';
    end if;
    update public.tracked_competitors t
      set is_active = (t.platform || ':' || t.handle = any(p_competitors))
      where t.user_id = p_user;
  end if;
end $$;

revoke all on function public.socia_apply_plan_keep(uuid, text[], text[], integer, integer) from public, anon, authenticated;
grant execute on function public.socia_apply_plan_keep(uuid, text[], text[], integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Product events: SOCIA's own conversion signals (pricing_viewed,
--    upgrade_clicked, usage_limit_reached, ...). Users can insert their own;
--    reading is for the SQL editor / service role only.
-- ---------------------------------------------------------------------------
create table if not exists public.product_events (
  id bigserial primary key,
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  props jsonb,
  created_at timestamptz not null default now()
);

create index if not exists product_events_name_time on public.product_events (name, created_at desc);
create index if not exists product_events_user_time on public.product_events (user_id, created_at desc);

alter table public.product_events enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'product_events' and policyname = 'product_events owner insert') then
    create policy "product_events owner insert" on public.product_events
      for insert with check (auth.uid() = user_id);
  end if;
end $$;
