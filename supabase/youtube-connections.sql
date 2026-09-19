-- YouTube user connections: one row per signed-in user, holding the OAuth
-- tokens and a snapshot of their own channel. Mirrors instagram_connections.
-- Safe to run more than once (guarded), so a re-run never errors or leaves a
-- lock behind in the SQL editor.

create table if not exists public.youtube_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  channel_id text,
  title text,
  handle text,
  avatar_url text,
  subscribers integer,
  access_token text not null,
  refresh_token text,
  scopes text[],
  token_expires_at timestamptz,
  connected_at timestamptz not null default now()
);

alter table public.youtube_connections enable row level security;

-- Each user can only see and change their own row (RLS). Guarded so re-running
-- this script does not raise "policy already exists".
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'youtube_connections' and policyname = 'youtube_connections owner select') then
    create policy "youtube_connections owner select" on public.youtube_connections
      for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'youtube_connections' and policyname = 'youtube_connections owner insert') then
    create policy "youtube_connections owner insert" on public.youtube_connections
      for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'youtube_connections' and policyname = 'youtube_connections owner update') then
    create policy "youtube_connections owner update" on public.youtube_connections
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'youtube_connections' and policyname = 'youtube_connections owner delete') then
    create policy "youtube_connections owner delete" on public.youtube_connections
      for delete using (auth.uid() = user_id);
  end if;
end $$;
