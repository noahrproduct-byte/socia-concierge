-- AI Clipper, AI Studio and credits (the Scale plan). Run after ai-spend.sql.
-- Safe to re-run.
--
--   clip_jobs / clips                 a long video sent to the clipping provider, and the clips it returned
--   generation_jobs / generations     an AI video or image request, and what came back
--   credit_ledger                     every credit movement: monthly grants, spends, refunds, top-ups
--   ai-media bucket                   uploaded sources and copies of every output (provider URLs expire)
--
-- Every row belongs to the brand's OWNER (user_id); a Brand Workspace may be
-- named too. The browser may read its owner's rows and nothing else: every
-- write goes through the server (service role) after the plan, the credits and
-- the rate limit were checked. Credits move only through the functions at the
-- bottom, which lock the owner's row so a spend can never overdraw.

-- ---------------------------------------------------------------------------
-- 1. The Scale plan
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles
  add constraint profiles_plan_check check (plan in ('free', 'starter', 'growth', 'pro', 'scale'));

alter table public.plan_config_overrides drop constraint if exists plan_config_overrides_plan_id_check;
alter table public.plan_config_overrides
  add constraint plan_config_overrides_plan_id_check check (plan_id in ('free', 'starter', 'growth', 'pro', 'scale'));

-- ---------------------------------------------------------------------------
-- 2. Storage: sources people upload and copies of every output
-- ---------------------------------------------------------------------------
-- Capped by size (2 GB, the Clipper's largest source; it can't exceed the
-- project's own file-size limit) and by type: the video and image formats the
-- Clipper and AI Studio take in and put out, nothing else.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('ai-media', 'ai-media', false, 2097152000, array['video/mp4', 'video/quicktime', 'video/3gpp', 'image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'ai-media: owners upload to their folder') then
    create policy "ai-media: owners upload to their folder" on storage.objects for insert to authenticated
      with check (bucket_id = 'ai-media' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'ai-media: owners read their folder') then
    create policy "ai-media: owners read their folder" on storage.objects for select to authenticated
      using (bucket_id = 'ai-media' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'ai-media: owners delete from their folder') then
    create policy "ai-media: owners delete from their folder" on storage.objects for delete to authenticated
      using (bucket_id = 'ai-media' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Clipper
-- ---------------------------------------------------------------------------
create table if not exists public.clip_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid null,
  -- 'youtube' (a link), 'upload' (a file in ai-media at source_path), 'url' (a remote video file)
  source_kind text not null check (source_kind in ('youtube', 'upload', 'url')),
  source_url text not null,
  source_path text null,
  -- minutes of source video the credits were reserved for (rounded up)
  source_minutes integer not null default 1 check (source_minutes > 0),
  -- { maxClips, lengths: [..], captions, headline, clipModel, lang }
  options jsonb not null default '{}'::jsonb,
  provider text not null default 'vizard',
  provider_job_id text null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'done', 'failed', 'cancelled')),
  credits_reserved integer not null default 0,
  credits_charged integer null,
  error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_polled_at timestamptz null,
  finished_at timestamptz null
);
create index if not exists clip_jobs_user_idx on public.clip_jobs (user_id, created_at desc);
create index if not exists clip_jobs_open_idx on public.clip_jobs (status) where status in ('queued', 'processing');
create index if not exists clip_jobs_provider_idx on public.clip_jobs (provider, provider_job_id);

create table if not exists public.clips (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.clip_jobs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid null,
  provider_clip_id text null,
  -- the provider's temporary URL (Vizard: 7 days) and SOCIA's own copy in ai-media
  video_url text null,
  video_path text null,
  thumbnail_path text null,
  duration_ms integer null,
  title text null,
  -- the provider's virality score, 0 to 10, when it gives one
  score numeric(4, 2) null,
  score_reason text null,
  transcript text null,
  caption text null,
  hashtags text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (job_id, provider_clip_id)
);
create index if not exists clips_user_idx on public.clips (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. AI Studio
-- ---------------------------------------------------------------------------
create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid null,
  kind text not null check (kind in ('text_to_video', 'image_to_video', 'text_to_image')),
  -- lib/credits/config.ts GENERATION_MODELS id
  model text not null,
  prompt text not null,
  -- an uploaded start image in ai-media (image_to_video)
  input_image_path text null,
  -- { durationSec, aspectRatio, ... } as sent
  input jsonb not null default '{}'::jsonb,
  -- the idea this came from (hook, concept, shots, caption), if any
  idea jsonb null,
  provider text not null default 'higgsfield',
  provider_request_id text null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'done', 'failed', 'cancelled')),
  credits_reserved integer not null default 0,
  credits_charged integer null,
  error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_polled_at timestamptz null,
  finished_at timestamptz null
);
create index if not exists generation_jobs_user_idx on public.generation_jobs (user_id, created_at desc);
create index if not exists generation_jobs_open_idx on public.generation_jobs (status) where status in ('queued', 'processing');
create index if not exists generation_jobs_provider_idx on public.generation_jobs (provider, provider_request_id);

create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.generation_jobs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid null,
  kind text not null check (kind in ('video', 'image')),
  -- the provider's temporary URL and SOCIA's own copy in ai-media
  output_url text null,
  output_path text null,
  thumbnail_path text null,
  duration_ms integer null,
  width integer null,
  height integer null,
  title text null,
  caption text null,
  hashtags text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists generations_user_idx on public.generations (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 5. Credits
-- ---------------------------------------------------------------------------
create table if not exists public.credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- grant: the monthly allowance; spend: a job; refund: a failed job's credits back; topup: a paid pack; adjust: by hand
  kind text not null check (kind in ('grant', 'spend', 'refund', 'topup', 'adjust')),
  -- negative for spend, positive otherwise
  amount integer not null,
  balance_after integer not null,
  -- what the entry is about: ('month', '2026-11-01'), ('clip_job', <id>), ('generation_job', <id>), ('stripe', <checkout session id>)
  ref_kind text null,
  ref_id text null,
  note text null,
  created_at timestamptz not null default now()
);
create index if not exists credit_ledger_user_idx on public.credit_ledger (user_id, created_at desc);
-- One grant a month, one spend and one refund a job, one top-up a payment.
create unique index if not exists credit_ledger_once_idx on public.credit_ledger (user_id, kind, ref_kind, ref_id) where ref_id is not null;

-- ---------------------------------------------------------------------------
-- 6. Access: owners read their own rows; every write is the server's
-- ---------------------------------------------------------------------------
alter table public.clip_jobs enable row level security;
alter table public.clips enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.generations enable row level security;
alter table public.credit_ledger enable row level security;

revoke all on public.clip_jobs, public.clips, public.generation_jobs, public.generations, public.credit_ledger from anon, authenticated;
grant select on public.clip_jobs, public.clips, public.generation_jobs, public.generations, public.credit_ledger to authenticated;
grant all on public.clip_jobs, public.clips, public.generation_jobs, public.generations, public.credit_ledger to service_role;

do $$
declare t text;
begin
  foreach t in array array['clip_jobs', 'clips', 'generation_jobs', 'generations', 'credit_ledger'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || ': owners read their own') then
      execute format('create policy %I on public.%I for select to authenticated using (user_id = auth.uid())', t || ': owners read their own', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Credit movements (service role only; each locks the owner)
-- ---------------------------------------------------------------------------
create or replace function public.socia_credit_balance(p_user uuid)
returns integer
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select coalesce(sum(amount), 0)::integer from public.credit_ledger where user_id = p_user;
$$;

-- The monthly allowance, once per month (a repeat call is a no-op).
create or replace function public.socia_credit_grant(p_user uuid, p_amount integer, p_month date)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare bal integer;
begin
  perform pg_advisory_xact_lock(hashtext('credits:' || p_user::text));
  bal := public.socia_credit_balance(p_user);
  if p_amount > 0 and not exists (
    select 1 from public.credit_ledger where user_id = p_user and kind = 'grant' and ref_kind = 'month' and ref_id = p_month::text
  ) then
    bal := bal + p_amount;
    insert into public.credit_ledger (user_id, kind, amount, balance_after, ref_kind, ref_id, note)
      values (p_user, 'grant', p_amount, bal, 'month', p_month::text, 'Monthly allowance');
  end if;
  return bal;
end;
$$;

-- Spend for a job. Refuses with 'insufficient_credits' when the balance is short; a repeat for the same job is a no-op.
create or replace function public.socia_credit_spend(p_user uuid, p_amount integer, p_ref_kind text, p_ref_id text, p_note text default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare bal integer;
begin
  if p_amount <= 0 then raise exception 'amount must be positive' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('credits:' || p_user::text));
  bal := public.socia_credit_balance(p_user);
  if exists (select 1 from public.credit_ledger where user_id = p_user and kind = 'spend' and ref_kind = p_ref_kind and ref_id = p_ref_id) then
    return bal;
  end if;
  if bal < p_amount then
    raise exception 'insufficient_credits' using errcode = 'P0001', detail = format('balance %s, needed %s', bal, p_amount);
  end if;
  bal := bal - p_amount;
  insert into public.credit_ledger (user_id, kind, amount, balance_after, ref_kind, ref_id, note)
    values (p_user, 'spend', -p_amount, bal, p_ref_kind, p_ref_id, p_note);
  return bal;
end;
$$;

-- Give a failed job's credits back: only what was spent on that job, only once.
create or replace function public.socia_credit_refund(p_user uuid, p_ref_kind text, p_ref_id text, p_note text default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare bal integer; spent integer;
begin
  perform pg_advisory_xact_lock(hashtext('credits:' || p_user::text));
  bal := public.socia_credit_balance(p_user);
  select -amount into spent from public.credit_ledger
    where user_id = p_user and kind = 'spend' and ref_kind = p_ref_kind and ref_id = p_ref_id;
  if spent is null or spent <= 0 then return bal; end if;
  if exists (select 1 from public.credit_ledger where user_id = p_user and kind = 'refund' and ref_kind = p_ref_kind and ref_id = p_ref_id) then
    return bal;
  end if;
  bal := bal + spent;
  insert into public.credit_ledger (user_id, kind, amount, balance_after, ref_kind, ref_id, note)
    values (p_user, 'refund', spent, bal, p_ref_kind, p_ref_id, p_note);
  return bal;
end;
$$;

-- A paid top-up, once per payment.
create or replace function public.socia_credit_topup(p_user uuid, p_amount integer, p_payment_id text, p_note text default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare bal integer;
begin
  if p_amount <= 0 then raise exception 'amount must be positive' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('credits:' || p_user::text));
  bal := public.socia_credit_balance(p_user);
  if exists (select 1 from public.credit_ledger where user_id = p_user and kind = 'topup' and ref_kind = 'stripe' and ref_id = p_payment_id) then
    return bal;
  end if;
  bal := bal + p_amount;
  insert into public.credit_ledger (user_id, kind, amount, balance_after, ref_kind, ref_id, note)
    values (p_user, 'topup', p_amount, bal, 'stripe', p_payment_id, p_note);
  return bal;
end;
$$;

revoke all on function public.socia_credit_balance(uuid) from public, anon, authenticated;
revoke all on function public.socia_credit_grant(uuid, integer, date) from public, anon, authenticated;
revoke all on function public.socia_credit_spend(uuid, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.socia_credit_refund(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.socia_credit_topup(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.socia_credit_balance(uuid) to service_role;
grant execute on function public.socia_credit_grant(uuid, integer, date) to service_role;
grant execute on function public.socia_credit_spend(uuid, integer, text, text, text) to service_role;
grant execute on function public.socia_credit_refund(uuid, text, text, text) to service_role;
grant execute on function public.socia_credit_topup(uuid, integer, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Unused uploads: Clipper sources and AI Studio start images older than a day
-- that no open job needs (a finished job no longer reads its source). The
-- minute job (/api/jobs/ai-poll) removes them through the storage API.
-- ---------------------------------------------------------------------------
create or replace function public.socia_ai_media_stale_uploads(p_older_than interval default interval '1 day', p_limit integer default 100)
returns setof text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select o.name from storage.objects o
  where o.bucket_id = 'ai-media'
    and (o.name like '%/clipper-sources/%' or o.name like '%/studio-inputs/%')
    and o.created_at < now() - p_older_than
    and not exists (select 1 from public.clip_jobs j where j.source_path = o.name and j.status in ('queued', 'processing'))
    and not exists (select 1 from public.generation_jobs g where g.input_image_path = o.name and g.status in ('queued', 'processing'))
  order by o.created_at
  limit greatest(1, least(p_limit, 500));
$$;
revoke all on function public.socia_ai_media_stale_uploads(interval, integer) from public, anon, authenticated;
grant execute on function public.socia_ai_media_stale_uploads(interval, integer) to service_role;
