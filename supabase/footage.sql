-- Footage: a standing clip library per workspace (one per owner per Brand
-- Workspace) that people drop raw clips into whenever they shoot, instead of
-- starting a project each time. A library is a studio_projects row with
-- kind = 'library', so uploads, understanding, Content Yield, builds and
-- Plan These Posts all run on the tables and policies studio.sql created.
-- Re-run safe. Run after deploying the code that reads `kind`.

alter table public.studio_projects
  add column if not exists kind text not null default 'batch';

comment on column public.studio_projects.kind is
  'batch = a Build-from-Clips project; library = the workspace''s standing Footage library (one per owner per workspace)';

-- One library per owner per workspace (a null workspace is the default brand).
create unique index if not exists studio_projects_one_library
  on public.studio_projects (user_id, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where kind = 'library';

create index if not exists studio_projects_kind_idx
  on public.studio_projects (user_id, kind);
