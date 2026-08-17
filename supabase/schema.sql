-- SOCIA database schema
-- Run this in your Supabase project: Dashboard → SQL Editor → New query → paste → Run.

-- Saved content plans: one row per generated deliverable, owned by a user.
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_handle text,
  niche text,
  platform text,
  data jsonb not null,
  created_at timestamptz not null default now()
);

-- Row Level Security: every user can only ever touch their own rows.
alter table public.plans enable row level security;

create policy "Users can read their own plans"
  on public.plans for select
  using (auth.uid() = user_id);

create policy "Users can insert their own plans"
  on public.plans for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own plans"
  on public.plans for delete
  using (auth.uid() = user_id);

-- Fast lookups of a user's plans, newest first.
create index if not exists plans_user_created_idx
  on public.plans (user_id, created_at desc);
