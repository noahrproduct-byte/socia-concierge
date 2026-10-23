-- SOCIA: AI assistants (MCP) — OAuth server, connections, audit log, rate limits (2026-10-14).
--
-- Run in the Supabase SQL editor AFTER workspaces.sql and team.sql. Idempotent.
--
-- SOCIA runs its own small OAuth 2.1 server so Claude, ChatGPT and other MCP
-- clients can read a person's SOCIA data after that person explicitly
-- connects them. Nothing here is a Supabase session: the tokens an assistant
-- holds are SOCIA's own random tokens, stored only as SHA-256 hashes, and
-- they open nothing but https://sociaos.com/mcp. Every table is server-only:
-- RLS is on with NO policies, so the browser (anon/authenticated) can read or
-- write none of it; the server reaches it with the service role and always
-- filters by the signed-in person.

-- Apps that asked to connect (dynamic registration, or a client metadata document URL).
create table if not exists public.oauth_clients (
  client_id text primary key,
  kind text not null check (kind in ('dcr', 'cimd')),
  client_name text,
  client_uri text,
  logo_uri text,
  redirect_uris text[] not null,
  created_at timestamptz not null default now(),
  -- CIMD documents are re-read when stale.
  fetched_at timestamptz
);

-- A sign-in in progress: what the app asked for, while the person looks at the consent screen.
create table if not exists public.oauth_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id text not null,
  redirect_uri text not null,
  code_challenge text not null,
  state text,
  scopes text[] not null,
  resource text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

-- What the person allowed: one connection per person per app. Revoking it
-- stops every token at once.
create table if not exists public.ai_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id text not null,
  client_name text,
  scopes text[] not null,
  workspace_ids uuid[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  unique (user_id, client_id)
);

create table if not exists public.oauth_codes (
  code_hash text primary key,
  connection_id uuid not null references public.ai_connections (id) on delete cascade,
  client_id text not null,
  redirect_uri text not null,
  code_challenge text not null,
  resource text,
  scopes text[] not null,
  expires_at timestamptz not null,
  used_at timestamptz
);

-- Access and refresh tokens, hashed. A refresh token is used once: the next
-- pair replaces it (replaced_by). Presenting a replaced one again means it
-- was copied, and every token of that connection is revoked.
create table if not exists public.oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.ai_connections (id) on delete cascade,
  kind text not null check (kind in ('access', 'refresh')),
  token_hash text not null unique,
  scopes text[] not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  replaced_by uuid
);
create index if not exists oauth_tokens_connection on public.oauth_tokens (connection_id);

-- Every tool call and authorization decision, without the data returned.
create table if not exists public.ai_audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  connection_id uuid,
  client_id text,
  workspace_id uuid,
  action text not null,           -- tool name, or authorize/token/revoke/register
  outcome text not null,          -- ok | denied | limited | error
  ms integer,
  detail jsonb
);
create index if not exists ai_audit_log_user on public.ai_audit_log (user_id, at desc);
create index if not exists ai_audit_log_connection on public.ai_audit_log (connection_id, at desc);

-- Fixed-window request counters for rate limits (per connection per minute,
-- per address for registration).
create table if not exists public.api_rate_counters (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);

alter table public.oauth_clients enable row level security;
alter table public.oauth_requests enable row level security;
alter table public.ai_connections enable row level security;
alter table public.oauth_codes enable row level security;
alter table public.oauth_tokens enable row level security;
alter table public.ai_audit_log enable row level security;
alter table public.api_rate_counters enable row level security;

revoke all on public.oauth_clients, public.oauth_requests, public.ai_connections, public.oauth_codes,
  public.oauth_tokens, public.ai_audit_log, public.api_rate_counters from anon, authenticated;

-- One hit against a fixed window; true when the hit is within the limit.
-- Atomic (one upsert), service role only.
create or replace function public.socia_rate_hit(p_key text, p_window_seconds integer, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count integer;
begin
  insert into public.api_rate_counters as c (key, window_start, count)
  values (p_key, v_start, 1)
  on conflict (key, window_start) do update set count = c.count + 1
  returning c.count into v_count;
  return v_count <= p_limit;
end $$;

revoke all on function public.socia_rate_hit(text, integer, integer) from public;
grant execute on function public.socia_rate_hit(text, integer, integer) to service_role;

-- Housekeeping: expired requests, codes, tokens and old counters go away.
-- The audit log keeps 180 days.
create or replace function public.socia_ai_cleanup()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.oauth_requests where expires_at < now() - interval '1 day';
  delete from public.oauth_codes where expires_at < now() - interval '1 day';
  delete from public.oauth_tokens where expires_at < now() - interval '7 days';
  delete from public.api_rate_counters where window_start < now() - interval '1 day';
  delete from public.ai_audit_log where at < now() - interval '180 days';
$$;

revoke all on function public.socia_ai_cleanup() from public;
grant execute on function public.socia_ai_cleanup() to service_role;

-- Daily at 04:20 UTC, when pg_cron is available (it is on SOCIA's project).
do $blk$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'socia-ai-cleanup';
    perform cron.schedule('socia-ai-cleanup', '20 4 * * *', 'select public.socia_ai_cleanup()');
  end if;
end $blk$;
