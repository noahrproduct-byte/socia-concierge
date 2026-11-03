-- SOCIA picks competitors (lib/competitorAutoPick.ts).
-- 1. tracked_competitors remembers who added a row and, for SOCIA's picks, why.
-- 2. competitor_dismissals remembers every competitor the customer removed, so
--    SOCIA never picks it again. Until this table exists SOCIA picks nothing.
-- Only the server writes and reads dismissals (service role): no browser
-- policies. Run after supabase/competitors-workspaces.sql. Safe to re-run.

alter table public.tracked_competitors add column if not exists added_by text not null default 'user';
alter table public.tracked_competitors add column if not exists pick_reason text;

create table if not exists public.competitor_dismissals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  platform text not null,
  handle text not null,
  dismissed_at timestamptz not null default now()
);

create unique index if not exists competitor_dismissals_key
  on public.competitor_dismissals (user_id, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), platform, handle);

alter table public.competitor_dismissals enable row level security;
revoke all on public.competitor_dismissals from anon, authenticated;
