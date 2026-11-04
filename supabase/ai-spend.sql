-- What each account's AI costs SOCIA this month, in millionths of a dollar
-- (lib/aiSpend.ts): Claude tokens, transcription seconds and music minutes,
-- priced when each call finishes. Every plan has a monthly ceiling
-- (lib/plans.ts aiSpendCapUsd); past it, AI features pause until the next
-- month, so no account can cost more than its plan brings in.
-- Server only: the browser has no access. Run after rls-audit.sql. Safe to re-run.

create table if not exists public.ai_spend (
  user_id uuid not null references auth.users (id) on delete cascade,
  month date not null,
  micro_usd bigint not null default 0,
  calls integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);

alter table public.ai_spend enable row level security;
revoke all on public.ai_spend from anon, authenticated;
grant all on public.ai_spend to service_role;

-- Add one call's cost, atomically. Service role only.
create or replace function public.socia_ai_spend_add(p_user uuid, p_month date, p_micros bigint)
returns bigint
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.ai_spend as s (user_id, month, micro_usd, calls, updated_at)
  values (p_user, p_month, greatest(p_micros, 0), 1, now())
  on conflict (user_id, month) do update
    set micro_usd = s.micro_usd + greatest(excluded.micro_usd, 0), calls = s.calls + 1, updated_at = now()
  returning micro_usd;
$$;

revoke all on function public.socia_ai_spend_add(uuid, date, bigint) from public, anon, authenticated;
grant execute on function public.socia_ai_spend_add(uuid, date, bigint) to service_role;
