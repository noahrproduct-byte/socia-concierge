-- Credits for every AI feature (2026-11-15): monthly credits expire, top-ups don't.
--
-- Replaces socia_credit_grant (supabase/ai-studio.sql) with the same signature,
-- so the app needs no change and works before or after this runs. Before this
-- runs, a month's credits are added once and unused ones carry over.
--
-- What it does on each call, under the owner's credit lock:
--   1. On the first call of a new month, last month's unused PLAN credits
--      expire. Plan credits are spent before top-ups, so what is left of them
--      is the balance minus what was carried in and what was topped up since,
--      never more than that month's grant. Top-ups never expire.
--   2. The month's plan credits are filled up to p_amount. After an upgrade
--      (or a new invitation bonus) a later call with a bigger p_amount adds
--      the difference; a smaller one never takes credits away.
--
-- Safe to run more than once.

create or replace function public.socia_credit_grant(p_user uuid, p_amount integer, p_month date)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bal integer;
  v_this_month text := p_month::text;
  v_granted integer;
  v_prev_month text;
  v_prev_grant integer;
  v_prev_start timestamptz;
  v_prev_base integer;
  v_prev_topups integer;
  v_expire integer;
begin
  perform pg_advisory_xact_lock(hashtext('credits:' || p_user::text));
  v_bal := public.socia_credit_balance(p_user);

  select coalesce(sum(amount), 0)::integer into v_granted
    from public.credit_ledger
    where user_id = p_user and kind = 'grant' and ref_kind = 'month' and left(ref_id, 10) = v_this_month;

  -- 1. First call this month: expire what is left of the latest earlier month's plan credits.
  if v_granted = 0 then
    select max(left(ref_id, 10)) into v_prev_month
      from public.credit_ledger
      where user_id = p_user and kind = 'grant' and ref_kind = 'month' and left(ref_id, 10) < v_this_month;
    if v_prev_month is not null and not exists (
      select 1 from public.credit_ledger
      where user_id = p_user and kind = 'adjust' and ref_kind = 'expire' and ref_id = v_this_month
    ) then
      select coalesce(sum(amount), 0)::integer, min(created_at) into v_prev_grant, v_prev_start
        from public.credit_ledger
        where user_id = p_user and kind = 'grant' and ref_kind = 'month' and left(ref_id, 10) = v_prev_month;
      -- The balance just before that month's first grant: what was carried in.
      select (balance_after - amount) into v_prev_base
        from public.credit_ledger
        where user_id = p_user and kind = 'grant' and ref_kind = 'month' and left(ref_id, 10) = v_prev_month
        order by created_at asc, id asc limit 1;
      select coalesce(sum(amount), 0)::integer into v_prev_topups
        from public.credit_ledger
        where user_id = p_user and kind = 'topup' and created_at >= v_prev_start;
      v_expire := greatest(0, least(v_prev_grant, v_bal - coalesce(v_prev_base, 0) - v_prev_topups));
      if v_expire > 0 then
        v_bal := v_bal - v_expire;
        insert into public.credit_ledger (user_id, kind, amount, balance_after, ref_kind, ref_id, note)
          values (p_user, 'adjust', -v_expire, v_bal, 'expire', v_this_month, 'Unused monthly credits expired');
      end if;
    end if;
  end if;

  -- 2. Fill this month's plan credits up to p_amount.
  if p_amount > v_granted then
    v_bal := v_bal + (p_amount - v_granted);
    insert into public.credit_ledger (user_id, kind, amount, balance_after, ref_kind, ref_id, note)
      values (
        p_user, 'grant', p_amount - v_granted, v_bal, 'month',
        case when v_granted = 0 then v_this_month else v_this_month || '+' || p_amount::text end,
        case when v_granted = 0 then 'Monthly credits' else 'Monthly credits, plan change' end
      );
  end if;
  return v_bal;
end;
$$;

revoke all on function public.socia_credit_grant(uuid, integer, date) from public, anon, authenticated;
grant execute on function public.socia_credit_grant(uuid, integer, date) to service_role;
