-- Automatic comment replies (lib/commentAuto.ts), opt-in per brand, Growth and up.
-- 1. comment_auto_settings: whether a brand replies automatically, and since
--    when (only comments made after that are answered, never an old backlog).
-- 2. comment_drafts.auto_ok: the drafter judged a short, friendly reply
--    enough (praise, thanks, emoji); questions, complaints and anything
--    sensitive stay false and wait for a person.
-- 3. comment_drafts.sent_automatically: the reply went out without a person,
--    so the inbox can say so.
-- Run after supabase/comment-replies.sql and rls-audit.sql. Safe to re-run.

alter table public.comment_drafts add column if not exists auto_ok boolean;
alter table public.comment_drafts add column if not exists sent_automatically boolean not null default false;

create table if not exists public.comment_auto_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  enabled boolean not null default false,
  enabled_at timestamptz,
  enabled_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create unique index if not exists comment_auto_settings_key
  on public.comment_auto_settings (user_id, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table public.comment_auto_settings enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'comment_auto_settings' and policyname = 'comment_auto_settings owner select') then
    create policy "comment_auto_settings owner select" on public.comment_auto_settings
      for select using (auth.uid() = user_id);
  end if;
end $$;

-- Turning it on or off goes through SOCIA's server (owner or Admin, Growth and
-- up, app/api/comments/auto); the browser only reads it.
revoke all on public.comment_auto_settings from anon;
revoke insert, update, delete, truncate on public.comment_auto_settings from authenticated;
drop trigger if exists socia_guard_workspace_fk on public.comment_auto_settings;
create trigger socia_guard_workspace_fk before insert or update on public.comment_auto_settings
  for each row execute function public.socia_guard_workspace_fk();
