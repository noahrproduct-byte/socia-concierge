-- SOCIA: Alerts (2026-09-29).
--
-- Run in the Supabase SQL editor AFTER workspaces.sql and team.sql. Idempotent.
--
-- Alerts follow DATA -> DETECTION -> VERIFIED EVENT -> ALERT. Every row is a
-- deterministic fact computed from the account's own real numbers (a post above
-- its format's median, a metric moved against the previous period); the AI never
-- invents one. The detection job (service role, from the daily cron) writes
-- them; a fingerprint keeps a re-run from ever duplicating an event.
--
-- The alert belongs to the workspace OWNER (user_id) and its workspace; the
-- owner and the workspace's members can read it and mark it read or dismissed.

create table if not exists public.alert_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  -- The workspace owner. Alerts are charged to and read through the owner.
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,                       -- breakout | performance_change | ...
  platform text,                            -- instagram | youtube | tiktok | facebook | null
  -- Stable per event so a detector re-run never creates a duplicate.
  fingerprint text not null,
  severity text not null default 'info',    -- good | info | warning
  title text not null,
  body text not null,
  evidence jsonb,                           -- the numbers behind the claim
  entity_ref text,                          -- post id / permalink, when the event is about one item
  detected_at timestamptz not null default now(),
  read_at timestamptz,
  dismissed_at timestamptz
);

-- One event per owner per fingerprint: the detector upserts ON CONFLICT DO NOTHING.
create unique index if not exists alert_events_fingerprint on public.alert_events (user_id, fingerprint);
create index if not exists alert_events_feed on public.alert_events (user_id, detected_at desc);
create index if not exists alert_events_workspace on public.alert_events (workspace_id, detected_at desc);

alter table public.alert_events enable row level security;

-- Read and mark (read/dismiss) for the owner and the workspace's members.
-- socia_ws_role() comes from team.sql: 'owner' for the owner, 'admin'/'member'
-- for members, null otherwise. Rows are created only by the service role.
do $blk$
begin
  drop policy if exists "alert_events read" on public.alert_events;
  create policy "alert_events read" on public.alert_events for select
    using (user_id = auth.uid() or public.socia_ws_role(workspace_id) is not null);

  drop policy if exists "alert_events mark" on public.alert_events;
  create policy "alert_events mark" on public.alert_events for update
    using (user_id = auth.uid() or public.socia_ws_role(workspace_id) is not null)
    with check (user_id = auth.uid() or public.socia_ws_role(workspace_id) is not null);
end $blk$;
