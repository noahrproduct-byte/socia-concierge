-- AI comment replies (Growth and up): one row per comment SOCIA has seen on
-- the workspace's Facebook Page posts or Instagram media, carrying the AI
-- draft and its lifecycle. Nothing is ever sent without a person approving it:
--   drafted  -> AI wrote a suggested reply, waiting in the inbox
--   approved -> person approved (possibly edited) and SOCIA is sending it
--   sent     -> reply posted; sent_reply_id is the platform's id for it
--   skipped  -> person chose not to reply
--   failed   -> platform rejected the send; `error` says why (retry allowed)
--
-- Idempotent and additive. Scoped per user + workspace like every other tenant
-- table; (user_id, platform, comment_id) is unique so re-syncs never duplicate.

create table if not exists public.comment_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid,
  platform text not null,                 -- 'facebook' | 'instagram'
  account_id text not null,               -- page_id / ig_user_id
  post_id text not null,
  comment_id text not null,
  author text,
  comment_text text,
  comment_created_at timestamptz,
  post_caption text,
  draft text,
  status text not null default 'drafted',
  sent_reply_id text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform, comment_id)
);

alter table public.comment_drafts enable row level security;

drop policy if exists "Users can read their own comment drafts" on public.comment_drafts;
create policy "Users can read their own comment drafts"
  on public.comment_drafts for select using (auth.uid() = user_id);

drop policy if exists "Users can add their own comment drafts" on public.comment_drafts;
create policy "Users can add their own comment drafts"
  on public.comment_drafts for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own comment drafts" on public.comment_drafts;
create policy "Users can update their own comment drafts"
  on public.comment_drafts for update using (auth.uid() = user_id);

drop policy if exists "Users can delete their own comment drafts" on public.comment_drafts;
create policy "Users can delete their own comment drafts"
  on public.comment_drafts for delete using (auth.uid() = user_id);

create index if not exists comment_drafts_inbox
  on public.comment_drafts (user_id, workspace_id, status, created_at desc);
