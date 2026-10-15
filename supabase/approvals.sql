-- SOCIA: Approval workflow (Pro) (2026-10-15).
--
-- Run in the Supabase SQL editor AFTER workspaces.sql, team.sql and
-- alerts.sql. Idempotent.
--
-- A Member submits a post for approval; the owner or an Admin approves it
-- (which schedules it) or sends it back with a note. One row per round, so
-- the history of a post's reviews is kept. Rows belong to the workspace OWNER
-- (user_id) and its workspace; the owner and the workspace's members can read
-- them. Every write goes through SOCIA's server after its own role checks
-- (service role), so there are no insert/update policies.

create table if not exists public.post_approvals (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.scheduled_posts (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  -- The workspace owner: whose post and whose plan.
  user_id uuid not null references auth.users (id) on delete cascade,
  submitted_by uuid not null references auth.users (id) on delete cascade,
  submitted_at timestamptz not null default now(),
  -- When the member wants it out; null = as soon as it's approved.
  requested_at timestamptz,
  submit_note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'changes_requested', 'withdrawn')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  -- The approver's note when sending it back.
  review_note text,
  -- When approval scheduled it (null for "now" or when scheduled elsewhere).
  scheduled_for timestamptz
);

-- At most one open round per post.
create unique index if not exists post_approvals_one_pending on public.post_approvals (post_id) where status = 'pending';
create index if not exists post_approvals_queue on public.post_approvals (user_id, status, submitted_at desc);
create index if not exists post_approvals_workspace on public.post_approvals (workspace_id, status, submitted_at desc);
create index if not exists post_approvals_post on public.post_approvals (post_id, submitted_at desc);

alter table public.post_approvals enable row level security;

do $blk$
begin
  drop policy if exists "post_approvals read" on public.post_approvals;
  create policy "post_approvals read" on public.post_approvals for select
    using (user_id = auth.uid() or public.socia_ws_role(workspace_id) is not null);
end $blk$;

revoke insert, update, delete on public.post_approvals from anon, authenticated;

-- Bell notifications for one person (an approval request goes to the owner
-- and each admin; a decision goes to the member who submitted). null keeps
-- the existing meaning: the whole workspace sees it.
alter table public.alert_events add column if not exists recipient_id uuid references auth.users (id) on delete cascade;
create index if not exists alert_events_recipient on public.alert_events (recipient_id, detected_at desc) where recipient_id is not null;

do $blk$
begin
  drop policy if exists "alert_events read" on public.alert_events;
  create policy "alert_events read" on public.alert_events for select
    using (
      (recipient_id is null or recipient_id = auth.uid())
      and (user_id = auth.uid() or public.socia_ws_role(workspace_id) is not null)
    );

  drop policy if exists "alert_events mark" on public.alert_events;
  create policy "alert_events mark" on public.alert_events for update
    using (
      (recipient_id is null or recipient_id = auth.uid())
      and (user_id = auth.uid() or public.socia_ws_role(workspace_id) is not null)
    )
    with check (
      (recipient_id is null or recipient_id = auth.uid())
      and (user_id = auth.uid() or public.socia_ws_role(workspace_id) is not null)
    );
end $blk$;
