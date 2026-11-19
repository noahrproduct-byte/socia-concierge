-- "Notify me when available" for platforms SOCIA isn't connecting yet
-- (lib/platformLaunch.ts, components/PlatformLaunch.tsx). One row per person
-- and platform; the address is the one they signed in with when they asked.
-- notified_at is set by whoever sends the "it's open" email, so nobody is told
-- twice. Safe to re-run.

create table if not exists public.platform_waitlist (
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('tiktok', 'facebook')),
  email text,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  primary key (user_id, platform)
);

alter table public.platform_waitlist enable row level security;
revoke all on public.platform_waitlist from anon, authenticated;
grant select, insert, delete on public.platform_waitlist to authenticated;
grant all on public.platform_waitlist to service_role;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'platform_waitlist' and policyname = 'platform_waitlist: own rows') then
    create policy "platform_waitlist: own rows" on public.platform_waitlist for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;
