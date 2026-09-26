-- SOCIA: plan and usage security fixes (2026-09-25).
--
-- Run in the Supabase SQL editor AFTER supabase/plans-and-usage.sql: this file
-- depends on usage_counters, socia_is_privileged() and
-- socia_protect_pause_columns() from there. Idempotent; safe to run again.
--
-- 1. Usage refunds become server-only. socia_release_usage(text, date) was
--    callable by any signed-in session and decremented the caller's own
--    counter, so a browser could reset every AI meter in a loop.
-- 2. niche_trends rows are owned. Every key embeds the user id
--    ('saved:<uid>', 'analysis:<uid>:<url>', 'opp:<uid>:<tag>', '<uid>:<niche>')
--    and the policies now check it. Before, any signed-in user could read,
--    insert or update any row, including other people's saved posts.
-- 3. product_events loses its browser insert policy. The server writes events
--    through the service role, so a session cannot forge limit or
--    subscription events.
-- 4. TikTok joins the downgrade model: its pause column is locked like the
--    other platforms, and socia_apply_plan_keep can keep or pause a TikTok
--    account (it used to reject 'tiktok:' ids and never paused them).

-- ---------------------------------------------------------------------------
-- 1. Usage refunds: service role only
-- ---------------------------------------------------------------------------
drop function if exists public.socia_release_usage(text, date);

create or replace function public.socia_release_usage(p_user uuid, p_meter text, p_period_start date)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_used integer;
begin
  if p_user is null then
    raise exception 'user required' using errcode = '22023';
  end if;
  update public.usage_counters uc
    set used = greatest(uc.used - 1, 0), updated_at = now()
    where uc.user_id = p_user and uc.meter = p_meter and uc.period_start = p_period_start
    returning uc.used into v_used;
  return coalesce(v_used, 0);
end $fn$;

revoke all on function public.socia_release_usage(uuid, text, date) from public, anon, authenticated;
grant execute on function public.socia_release_usage(uuid, text, date) to service_role;

-- ---------------------------------------------------------------------------
-- 2. niche_trends: owner-scoped by the user id embedded in the key
-- ---------------------------------------------------------------------------
create or replace function public.socia_niche_key_is_mine(p_key text)
returns boolean
language sql
stable
as $fn$
  select auth.uid() is not null
     and p_key ~ ('^(saved:|analysis:|opp:)?' || auth.uid()::text || '(:|$)');
$fn$;

drop policy if exists "Signed-in users can read niche trends" on public.niche_trends;
drop policy if exists "Signed-in users can add niche trends" on public.niche_trends;
drop policy if exists "Signed-in users can update niche trends" on public.niche_trends;
drop policy if exists "niche_trends owner select" on public.niche_trends;
drop policy if exists "niche_trends owner insert" on public.niche_trends;
drop policy if exists "niche_trends owner update" on public.niche_trends;
drop policy if exists "niche_trends owner delete" on public.niche_trends;

create policy "niche_trends owner select" on public.niche_trends
  for select using (public.socia_niche_key_is_mine(niche));
create policy "niche_trends owner insert" on public.niche_trends
  for insert with check (public.socia_niche_key_is_mine(niche));
create policy "niche_trends owner update" on public.niche_trends
  for update using (public.socia_niche_key_is_mine(niche)) with check (public.socia_niche_key_is_mine(niche));
create policy "niche_trends owner delete" on public.niche_trends
  for delete using (public.socia_niche_key_is_mine(niche));

-- ---------------------------------------------------------------------------
-- 3. product_events: no browser inserts
-- ---------------------------------------------------------------------------
drop policy if exists "product_events owner insert" on public.product_events;

-- ---------------------------------------------------------------------------
-- 4. TikTok in the downgrade model
-- ---------------------------------------------------------------------------
do $blk$
begin
  if to_regclass('public.tiktok_connections') is not null then
    execute 'alter table public.tiktok_connections add column if not exists plan_suspended_at timestamptz';
    execute 'drop trigger if exists socia_protect_pause_columns on public.tiktok_connections';
    execute 'create trigger socia_protect_pause_columns before insert or update on public.tiktok_connections for each row execute function public.socia_protect_pause_columns()';
  end if;
end $blk$;

-- Same contract as before, now aware of 'tiktok:<open_id>' ids. TikTok is
-- referenced through dynamic SQL so the function also works on a database
-- where that table has not been created yet.
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
as $fn$
declare
  v_now timestamptz := now();
  v_bad integer;
  v_first text;
  v_tt boolean := to_regclass('public.tiktok_connections') is not null;
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text));

  if p_accounts is not null then
    if coalesce(array_length(p_accounts, 1), 0) > p_account_limit then
      raise exception 'more accounts than the plan allows' using errcode = '22023';
    end if;

    execute format($q$
      select count(*)
        from unnest($1) as k
        where not exists (select 1 from public.instagram_connections c where c.user_id = $2 and 'instagram:' || c.ig_user_id = k)
          and not exists (select 1 from public.facebook_connections c where c.user_id = $2 and 'facebook:' || c.page_id = k)
          and not exists (select 1 from public.youtube_connections c where c.user_id = $2 and 'youtube:' || c.channel_id = k)
          %s
    $q$, case when v_tt
           then $c$and not exists (select 1 from public.tiktok_connections c where c.user_id = $2 and 'tiktok:' || c.open_id = k)$c$
           else '' end)
      into v_bad using p_accounts, p_user;
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
    if v_tt then
      execute $u$
        update public.tiktok_connections c
          set plan_suspended_at = case when 'tiktok:' || c.open_id = any($1) then null else coalesce(c.plan_suspended_at, $2) end
          where c.user_id = $3
      $u$ using p_accounts, v_now, p_user;
    end if;

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
end $fn$;

revoke all on function public.socia_apply_plan_keep(uuid, text[], text[], integer, integer) from public, anon, authenticated;
grant execute on function public.socia_apply_plan_keep(uuid, text[], text[], integer, integer) to service_role;
