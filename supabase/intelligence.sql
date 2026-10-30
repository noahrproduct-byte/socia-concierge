-- SOCIA 2.0, Milestone 1: the shared intelligence store.
--   insights           one structured finding per row, with its evidence,
--                      possible explanations, confidence, limitations,
--                      recommended action and source (lib/intel/insight.ts)
--   intelligence_jobs  every analysis run, its state and its result
-- Every page (Overview, Analytics, Plan, Studio, Ask SOCIA) reads the same
-- findings instead of recomputing its own.
--
-- Same pattern as growth-profile.sql: owned by the workspace OWNER
-- (user_id), scoped to a Brand Workspace, owner-only row-level security
-- (team members act through the server's service role, by role), and the
-- workspace guard trigger. Run after growth-profile.sql: Dashboard -> SQL
-- Editor -> New query -> paste -> Run. Safe to re-run. Nothing existing changes.

-- ---------------------------------------------------------------------------
-- 1. Insights
-- ---------------------------------------------------------------------------
create table if not exists public.insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  -- Stable identity of a finding (producer + subject), so a re-run updates it instead of adding a copy.
  fingerprint text not null,
  -- Which producer wrote it (lib/intel/producers.ts).
  producer text not null,
  -- performance | content | diagnostic | niche | goal
  category text not null,
  platform text,
  title text not null,
  -- FACT: what the data shows, in a sentence.
  observation text not null,
  -- Supporting metrics: [{label, value, unit, basis}]
  metrics jsonb not null default '[]'::jsonb,
  -- Posts it is about: [{platform, id, title, permalink}]
  posts jsonb not null default '[]'::jsonb,
  period_start timestamptz,
  period_end timestamptz,
  -- INTERPRETATION or HYPOTHESIS lines: [{type, text}]
  explanations jsonb not null default '[]'::jsonb,
  -- 0-100, with the rule that set it in source.
  confidence integer not null default 0,
  limitations text[] not null default '{}',
  -- RECOMMENDATION: {action, why, learning, href}
  recommendation jsonb,
  goal_id uuid references public.growth_goals (id) on delete set null,
  -- Where it came from: {producer, rule, data: [...], retrieved_at}
  source jsonb not null default '{}'::jsonb,
  -- active | dismissed | resolved | superseded
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The last run that still found it.
  last_seen_at timestamptz not null default now(),
  constraint insights_category_check check (category in ('performance', 'content', 'diagnostic', 'niche', 'goal')),
  constraint insights_status_check check (status in ('active', 'dismissed', 'resolved', 'superseded')),
  constraint insights_confidence_check check (confidence between 0 and 100)
);
create unique index if not exists insights_brand_fingerprint_idx
  on public.insights (user_id, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), fingerprint);
create index if not exists insights_owner_idx on public.insights (user_id, workspace_id, status, updated_at desc);

-- ---------------------------------------------------------------------------
-- 2. Intelligence jobs
-- ---------------------------------------------------------------------------
create table if not exists public.intelligence_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  -- refresh_insights | understand_account | ...
  kind text not null,
  -- queued | running | done | failed
  status text not null default 'queued',
  -- What started it: onboarding | manual | cron
  trigger text not null default 'manual',
  attempts integer not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  result jsonb,
  created_at timestamptz not null default now(),
  constraint intelligence_jobs_status_check check (status in ('queued', 'running', 'done', 'failed'))
);
create index if not exists intelligence_jobs_owner_idx on public.intelligence_jobs (user_id, workspace_id, kind, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. RLS: the owner's own session reads and writes their rows.
-- ---------------------------------------------------------------------------
alter table public.insights enable row level security;
alter table public.intelligence_jobs enable row level security;

do $$
declare t text;
begin
  foreach t in array array['insights', 'intelligence_jobs'] loop
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t || ' owner select') then
      execute format('create policy %I on public.%I for select using (auth.uid() = user_id)', t || ' owner select', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t || ' owner insert') then
      execute format('create policy %I on public.%I for insert with check (auth.uid() = user_id)', t || ' owner insert', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t || ' owner update') then
      execute format('create policy %I on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t || ' owner update', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t || ' owner delete') then
      execute format('create policy %I on public.%I for delete using (auth.uid() = user_id)', t || ' owner delete', t);
    end if;
  end loop;
end $$;

revoke all on public.insights from anon;
revoke all on public.intelligence_jobs from anon;

-- ---------------------------------------------------------------------------
-- 4. A row may only name a workspace its owner owns.
-- ---------------------------------------------------------------------------
do $blk$
declare t text;
begin
  foreach t in array array['insights', 'intelligence_jobs'] loop
    execute format('drop trigger if exists socia_guard_workspace_fk on public.%I', t);
    execute format('create trigger socia_guard_workspace_fk before insert or update on public.%I for each row execute function public.socia_guard_workspace_fk()', t);
  end loop;
end $blk$;
