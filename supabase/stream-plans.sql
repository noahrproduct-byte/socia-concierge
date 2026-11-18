-- Live streams by plan (lib/plans.ts STREAM_LIMITS): channels at once, watching
-- hours a month, and whether the clip's video is kept (Growth and up).
-- Run after stream-clipper.sql. Safe to re-run.

-- What the plan allowed when the channel was started; the watcher reads these.
alter table public.stream_watches add column if not exists keep_video boolean not null default false;
alter table public.stream_watches add column if not exists hours_limit numeric;
alter table public.stream_watches add column if not exists usage_period date;

-- Live watching used, per person and plan month (each live channel counts).
create table if not exists public.stream_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  seconds integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, period_start)
);

alter table public.stream_usage enable row level security;
revoke all on public.stream_usage from anon, authenticated;
grant select on public.stream_usage to authenticated;
grant all on public.stream_usage to service_role;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'stream_usage' and policyname = 'stream_usage: owners read their own') then
    create policy "stream_usage: owners read their own" on public.stream_usage for select to authenticated using (user_id = auth.uid());
  end if;
end $$;
