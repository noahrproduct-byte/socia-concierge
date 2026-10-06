-- Instagram usernames a brand has used in SOCIA (Tag people, Collaborators),
-- remembered the moment they are added so they come back as suggestions —
-- plus what Instagram's account lookup said about them when a Facebook Page is
-- linked. One row per brand (scope = workspace id, or 'owner' before
-- workspaces) and username. Safe to re-run.
create table if not exists public.ig_known_people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  scope text not null,
  username text not null,
  uses integer not null default 1,
  last_used_at timestamptz not null default now(),
  -- Instagram account lookup (Business Discovery): found | not_found | not_business
  lookup_status text,
  name text,
  avatar text,
  followers integer,
  looked_up_at timestamptz,
  unique (user_id, scope, username)
);

create index if not exists ig_known_people_recent_idx on public.ig_known_people (user_id, scope, last_used_at desc);

alter table public.ig_known_people enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ig_known_people' and policyname='ig_known_people owner select') then
    create policy "ig_known_people owner select" on public.ig_known_people for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ig_known_people' and policyname='ig_known_people owner insert') then
    create policy "ig_known_people owner insert" on public.ig_known_people for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ig_known_people' and policyname='ig_known_people owner update') then
    create policy "ig_known_people owner update" on public.ig_known_people for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ig_known_people' and policyname='ig_known_people owner delete') then
    create policy "ig_known_people owner delete" on public.ig_known_people for delete using (auth.uid() = user_id);
  end if;
end $$;
