-- The editing pattern library (lib/editPatterns): what proven Reels in a niche
-- do with length, rhythm, the hook, text and the ask, with the evidence. The
-- niche scan saves each brand's measured patterns here; the study patterns
-- ship with the code. Evidence can name a brand's tracked competitors, so only
-- SOCIA's server reads and writes it, always for one brand's scope.
-- Safe to re-run.

create table if not exists public.edit_patterns (
  id uuid primary key default gen_random_uuid(),
  -- The brand it belongs to: the niche scan's scope (owner id, or owner:workspace).
  scope text not null,
  key text not null,
  source text not null,
  niche text,
  category text not null,
  platform text not null default 'instagram',
  technique text not null,
  summary text not null,
  characteristics jsonb not null default '{}',
  applies_to text[] not null default '{}',
  evidence jsonb not null default '[]',
  observed jsonb not null default '{}',
  confidence text not null,
  limitations text[] not null default '{}',
  -- What this brand's own published cuts showed when they used it (phase 4).
  results jsonb,
  verified_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope, key)
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'edit_patterns_source_check') then
    alter table public.edit_patterns add constraint edit_patterns_source_check check (source in ('study', 'scan', 'results'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'edit_patterns_confidence_check') then
    alter table public.edit_patterns add constraint edit_patterns_confidence_check check (confidence in ('high', 'medium', 'low'));
  end if;
end $$;
create index if not exists edit_patterns_scope_idx on public.edit_patterns (scope, verified_at desc);

alter table public.edit_patterns enable row level security;
revoke all on public.edit_patterns from anon, authenticated;
grant all on public.edit_patterns to service_role;
