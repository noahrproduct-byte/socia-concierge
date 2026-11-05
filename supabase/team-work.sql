-- SOCIA: working as a team (2026-11-05). lib/teamWork.ts, lib/teamWorkServer.ts.
--
-- Run in the Supabase SQL editor AFTER workspaces.sql, team.sql, alerts.sql,
-- approvals.sql and post-destinations.sql. Idempotent.
--
-- 1. Who made each post: scheduled_posts.created_by. The owner's own saves
--    fill it by default; saves a Member or Admin makes through SOCIA's server
--    are stamped by the server after the save.
-- 2. Ready for review (every plan with a team): a Member marks a draft ready
--    and the owner and Admins are told. ready_at / ready_by / ready_note on
--    the post; scheduling or publishing it clears them.
-- 3. The weekly plan's videos handed to a person: plan_tasks, one per plan
--    post. Rows belong to the workspace OWNER (user_id); the owner and the
--    workspace's people can read them. Every write goes through SOCIA's
--    server after its own role checks (service role), so there are no
--    insert/update policies.
-- The Team activity list in Settings is read from these columns and from
-- post_approvals; nothing else is recorded.

alter table public.scheduled_posts add column if not exists created_by uuid references auth.users (id) on delete set null;
alter table public.scheduled_posts alter column created_by set default auth.uid();
alter table public.scheduled_posts add column if not exists ready_at timestamptz;
alter table public.scheduled_posts add column if not exists ready_by uuid references auth.users (id) on delete set null;
alter table public.scheduled_posts add column if not exists ready_note text;

create index if not exists scheduled_posts_created_by_idx on public.scheduled_posts (user_id, created_at desc) where created_by is not null;
create index if not exists scheduled_posts_ready_idx on public.scheduled_posts (user_id, ready_at desc) where ready_at is not null;

create table if not exists public.plan_tasks (
  id uuid primary key default gen_random_uuid(),
  -- The workspace owner: whose plan and whose workspace.
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  plan_id uuid not null references public.plans (id) on delete cascade,
  -- weeklyPlan[].id of the post this is for.
  plan_item_id text not null,
  -- Copied from the plan when assigned, so the task reads well after edits.
  day text,
  title text not null,
  assignee_id uuid not null references auth.users (id) on delete cascade,
  assigned_by uuid references auth.users (id) on delete set null,
  due_on date,
  note text,
  status text not null default 'open' check (status in ('open', 'done')),
  -- The post the assignee made for it, when they made one in SOCIA.
  post_id uuid references public.scheduled_posts (id) on delete set null,
  done_at timestamptz,
  done_by uuid references auth.users (id) on delete set null,
  done_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One person per plan post.
create unique index if not exists plan_tasks_one_per_item on public.plan_tasks (plan_id, plan_item_id);
create index if not exists plan_tasks_assignee on public.plan_tasks (user_id, assignee_id, status, due_on);
create index if not exists plan_tasks_workspace on public.plan_tasks (workspace_id, created_at desc);

alter table public.plan_tasks enable row level security;

do $blk$
begin
  drop policy if exists "plan_tasks read" on public.plan_tasks;
  create policy "plan_tasks read" on public.plan_tasks for select
    using (user_id = auth.uid() or public.socia_ws_role(workspace_id) is not null);
end $blk$;

revoke insert, update, delete on public.plan_tasks from anon, authenticated;
