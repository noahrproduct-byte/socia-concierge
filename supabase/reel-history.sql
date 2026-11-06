-- Per-Reel history (lib/reelHistory.ts). Safe to re-run.
--
-- SOCIA has only ever kept each Reel's latest numbers, so it could not say how
-- a Reel's views grew or compare a three-day-old Reel with a month-old one.
-- This keeps one observation per Reel per UTC day for its first 30 days: the
-- first sync of the day wins, so the series is taken at a consistent hour.
-- Only numbers Instagram returned are written; a missing metric stays null,
-- never 0. The Content Rater's outlook (lib/outlook.ts) reads these once
-- enough days have built up.
--
-- Scoped like account_snapshots: by the owner and the Instagram account. Rows
-- are removed when the account is disconnected (the disconnect route and the
-- Meta data-deletion callback) and with the user.

create table if not exists public.reel_history (
  user_id uuid not null references auth.users (id) on delete cascade,
  ig_user_id text not null,
  media_id text not null,
  day date not null,
  posted_at timestamptz not null,
  views integer,
  reach integer,
  likes integer,
  comments integer,
  saved integer,
  shares integer,
  retrieved_at timestamptz not null default now(),
  primary key (user_id, ig_user_id, media_id, day)
);
create index if not exists reel_history_account_idx on public.reel_history (user_id, ig_user_id, day);

alter table public.reel_history enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reel_history' and policyname = 'reel_history owner select') then
    create policy "reel_history owner select" on public.reel_history for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reel_history' and policyname = 'reel_history owner insert') then
    create policy "reel_history owner insert" on public.reel_history for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reel_history' and policyname = 'reel_history owner delete') then
    create policy "reel_history owner delete" on public.reel_history for delete using (auth.uid() = user_id);
  end if;
end $$;

-- No update policy: a day's first observation is never rewritten.
revoke all on public.reel_history from anon;
revoke update on public.reel_history from authenticated;
