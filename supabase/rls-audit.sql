-- SOCIA row-level security audit, 2026-10-23 (docs/security/rls-audit-2026-10-23.md).
--
-- Run AFTER security-hardening.sql. Safe to run more than once; deletes no
-- data. supabase/tests/ applies it on top of every earlier migration and
-- proves each rule (npx vitest run supabase/tests).

-- ---------------------------------------------------------------------------
-- 1. Every SOCIA function gets a fixed search_path with pg_temp LAST.
--    Without it, Postgres looks in the session's temporary schema first, so
--    a definer function could be pointed at a look-alike table or function.
--    Not reachable through Supabase REST today (no session can create temp
--    objects there), but it is the documented hardening and Supabase's
--    linter flags it. Five functions had no search_path at all.
-- ---------------------------------------------------------------------------
do $blk$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'socia\_%'
  loop
    execute format('alter function %s set search_path = public, pg_temp', f);
  end loop;
end $blk$;

-- ---------------------------------------------------------------------------
-- 2. discovered_accounts has a workspace_id but was missed when the
--    workspace guard went on its siblings (security-hardening.sql section 9),
--    so a session could tag its own rows with another owner's workspace id.
--    Readers filter by owner, so nobody else saw them; the guard makes the
--    rule the same on every browser-writable table with a workspace_id.
--    (workspace_invites and workspace_members are excluded on purpose: an
--    Admin's session writes invites into a workspace it does not own, and
--    their own policies already check the workspace role.)
-- ---------------------------------------------------------------------------
do $blk$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'discovered_accounts' and column_name = 'workspace_id') then
    drop trigger if exists socia_guard_workspace_fk on public.discovered_accounts;
    create trigger socia_guard_workspace_fk before insert or update on public.discovered_accounts
      for each row execute function public.socia_guard_workspace_fk();
  end if;
end $blk$;

-- ---------------------------------------------------------------------------
-- 3. Signed-out visitors (the public anon key) get no table privileges at
--    all. Supabase grants them everything by default and row-level security
--    then denies every row; nothing in SOCIA reads a table signed out (public
--    pages query only after sign-in, every API route refuses first, and the
--    browser never queries tables directly). Without the grants, a future
--    policy written too loosely still can't expose data to the anon key.
--    Storage (its own schema) and the two policy helpers are unaffected.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
-- Tables created later by the SQL editor (role postgres) start without them too.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
