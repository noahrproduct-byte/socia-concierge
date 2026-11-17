-- Stream clipper (AI Clipper → Live streams): SOCIA watches up to four live
-- Twitch channels, reads their chat, and clips the moments chat spikes on
-- with Twitch's own Create Clip (lib/streams/*, worker/stream-watcher).
-- Run after ai-studio.sql and security-hardening.sql. Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. The Twitch account a person connected. Tokens are server-only.
-- ---------------------------------------------------------------------------
create table if not exists public.twitch_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  twitch_user_id text not null,
  login text not null,
  display_name text,
  avatar_url text,
  access_token text not null,
  refresh_token text not null,
  scopes text[] not null default '{}',
  token_expires_at timestamptz not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. A channel being watched (or that was).
-- ---------------------------------------------------------------------------
create table if not exists public.stream_watches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid,
  channel_id text not null,
  channel_login text not null,
  channel_name text,
  avatar_url text,
  status text not null default 'watching',
  -- What the watcher last saw: live or not, chat read, and when it last checked in.
  live boolean,
  stream_title text,
  messages_seen integer not null default 0,
  last_chat_at timestamptz,
  watcher_seen_at timestamptz,
  -- Whether Twitch lets this person download this channel's clips (their own channel, or one they edit). Null until tried.
  can_download boolean,
  clip_duration numeric not null default 30,
  last_error text,
  started_at timestamptz not null default now(),
  stopped_at timestamptz
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'stream_watches_status_check') then
    alter table public.stream_watches add constraint stream_watches_status_check check (status in ('watching', 'stopped'));
  end if;
end $$;
create index if not exists stream_watches_user_idx on public.stream_watches (user_id, started_at desc);
create index if not exists stream_watches_watching_idx on public.stream_watches (status) where status = 'watching';

-- ---------------------------------------------------------------------------
-- 3. A moment SOCIA clipped.
-- ---------------------------------------------------------------------------
create table if not exists public.stream_clips (
  id uuid primary key default gen_random_uuid(),
  watch_id uuid not null references public.stream_watches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid,
  channel_id text not null,
  channel_login text not null,
  -- Twitch's clip.
  twitch_clip_id text,
  edit_url text,
  url text,
  embed_url text,
  thumbnail_url text,
  title text,
  duration numeric,
  -- What chat did (lib/streams/spikes.ts).
  spike_at timestamptz not null,
  rate numeric,
  baseline numeric,
  people integer,
  hype numeric,
  sustain_sec integer,
  score integer,
  why text,
  status text not null default 'making',
  -- On the person's own or edited channel: the video, kept in storage for the editor.
  video_path text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'stream_clips_status_check') then
    alter table public.stream_clips add constraint stream_clips_status_check check (status in ('making', 'ready', 'failed'));
  end if;
end $$;
create index if not exists stream_clips_user_idx on public.stream_clips (user_id, created_at desc);
create index if not exists stream_clips_watch_idx on public.stream_clips (watch_id, created_at desc);
create unique index if not exists stream_clips_twitch_idx on public.stream_clips (twitch_clip_id) where twitch_clip_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Access. Tokens: nobody but the server. Watches and clips: owners read
--    their own; every write is the server's or the watcher's.
-- ---------------------------------------------------------------------------
alter table public.twitch_connections enable row level security;
alter table public.stream_watches enable row level security;
alter table public.stream_clips enable row level security;

revoke all on public.twitch_connections from anon, authenticated;
grant all on public.twitch_connections to service_role;

revoke all on public.stream_watches, public.stream_clips from anon, authenticated;
grant select on public.stream_watches, public.stream_clips to authenticated;
grant all on public.stream_watches, public.stream_clips to service_role;

do $$
declare t text;
begin
  foreach t in array array['stream_watches', 'stream_clips'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || ': owners read their own') then
      execute format('create policy %I on public.%I for select to authenticated using (user_id = auth.uid())', t || ': owners read their own', t);
    end if;
  end loop;
end $$;
