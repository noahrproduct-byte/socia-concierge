-- Contacts (lib/contacts): the people who interact with a brand, per Brand
-- Workspace. Two ways in:
--   1. Instagram commenters on the brand's own posts (read with the comment
--      permission SOCIA already has): handle, name, how often, which posts.
--   2. A sign-up page SOCIA hosts per brand (/l/<slug>): an email, given with
--      consent, and optionally an Instagram handle.
-- Tags (by hand, or from keyword rules) and notes are the brand's own.
-- Commenter contacts are deleted with the Instagram connection that saw them
-- (source_account = the brand's Instagram user id); sign-ups are kept until the
-- brand deletes them or the person asks.
-- Run after supabase/workspaces.sql. Safe to re-run.

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  -- instagram | null (a sign-up with no handle)
  platform text,
  -- lowercase, no @
  handle text,
  -- the brand's Instagram user id that saw this commenter
  source_account text,
  name text,
  email text,
  -- when the person ticked the consent box on the sign-up page
  consent_at timestamptz,
  tags text[] not null default '{}',
  notes text,
  comment_count integer not null default 0,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists contacts_handle_key
  on public.contacts (user_id, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), platform, handle)
  where handle is not null;
create unique index if not exists contacts_email_key
  on public.contacts (user_id, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(email))
  where email is not null and handle is null;
create index if not exists contacts_owner_idx on public.contacts (user_id, workspace_id, last_seen desc);
create index if not exists contacts_source_idx on public.contacts (source_account) where source_account is not null;

-- What each contact did: one row per comment or sign-up.
create table if not exists public.contact_events (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  -- comment | signup
  kind text not null,
  -- the comment id, or the sign-up page's slug
  ref text not null,
  post_id text,
  -- the first words of the comment
  excerpt text,
  at timestamptz not null default now(),
  unique (contact_id, kind, ref)
);
create index if not exists contact_events_contact_idx on public.contact_events (contact_id, at desc);

-- Keyword rules: a comment containing the keyword tags its author.
create table if not exists public.contact_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  keyword text not null,
  tag text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists contact_rules_key
  on public.contact_rules (user_id, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(keyword));

-- One sign-up page per Brand Workspace. Read by the public page through the
-- server (service role): no browser policies for anonymous visitors.
create table if not exists public.signup_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  slug text not null unique,
  title text not null,
  intro text,
  button text not null default 'Sign up',
  ask_handle boolean not null default true,
  -- every sign-up gets this tag
  tag text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists signup_pages_workspace_key
  on public.signup_pages (user_id, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid));

do $$
declare t text;
begin
  foreach t in array array['contacts', 'contact_events', 'contact_rules', 'signup_pages'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || ' owner all') then
      execute format('create policy %I on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t || ' owner all', t);
    end if;
  end loop;
end $$;
