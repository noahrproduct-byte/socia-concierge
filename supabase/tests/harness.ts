// A local stand-in for SOCIA's Supabase database, for authorization tests.
//
// Real Postgres (PGlite: Postgres 18 compiled to WebAssembly, in process),
// with the parts of Supabase the migrations and policies depend on:
//   - the roles anon, authenticated and service_role (BYPASSRLS), and the
//     default privileges Supabase grants them on everything in `public`;
//   - auth.users and auth.uid() / auth.role() / auth.jwt(), read from the
//     request.jwt.claims setting exactly as PostgREST sets it per request;
//   - storage.buckets / storage.objects with RLS on, and storage.foldername().
// Then every migration in supabase/ in the order production ran them.
//
// Requests are simulated the way PostgREST runs them: inside a transaction,
// `set local role <role>` plus `set local request.jwt.claims = <jwt>`. That
// is what the anon key, a user's session and the service key each turn
// into, so a query that is refused here is refused through Supabase REST.
//
// Not covered: pg_cron and pg_net (the *-cron.sql files are skipped), and
// Supabase's storage HTTP API itself (its list and download endpoints read
// storage.objects under the caller's role, which is what is tested).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

/** The migrations, in the order they were added to the repository (= applied). */
export const MIGRATIONS = [
  "schema.sql",
  "youtube-connections.sql",
  "plans-and-usage.sql",
  "post-destinations.sql",
  "plans-security-fix.sql",
  "workspaces.sql",
  "team.sql",
  "alerts.sql",
  "competitor-history.sql",
  "competitors-workspaces.sql",
  "platform-snapshots.sql",
  "comment-replies.sql",
  "billing.sql",
  "tiktok-catchup.sql",
  "studio.sql",
  "studio-phase-b.sql",
  "studio-audio.sql",
  "known-usernames.sql",
  "ai-assistants.sql",
  "approvals.sql",
  "security-hardening.sql",
  "rls-audit.sql",
  "growth-profile.sql",
  "platform-deletions.sql",
  "intelligence.sql",
];

const SUPABASE_STANDIN = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role authenticator noinherit login;
grant anon, authenticated, service_role to authenticator;
create role supabase_admin;

create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  raw_app_meta_data jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select auth.jwt() ->> 'role'
$$;
create function auth.email() returns text language sql stable as $$
  select auth.jwt() ->> 'email'
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant select on auth.users to service_role;

create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  owner uuid,
  public boolean default false,
  allowed_mime_types text[],
  file_size_limit bigint,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid,
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
create function storage.filename(name text) returns text language sql immutable as $$
  select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)]
$$;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;
grant execute on all functions in schema storage to anon, authenticated, service_role;

-- Supabase's defaults: everything created in public is reachable by the API
-- roles, and RLS (or a revoke) is what limits them.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

export type Db = PGlite;

/**
 * A fresh database with every migration applied once, in production order,
 * then `rerun` applied again (proves those files are idempotent). schema.sql
 * and plans-and-usage.sql are run-once files by design (re-running them would
 * restore superseded policies), so they are never re-applied.
 */
export async function freshDatabase(opts: { rerun?: string[]; before?: Record<string, (db: Db) => Promise<void>> } = {}): Promise<{ db: Db; applied: string[] }> {
  const db = new PGlite();
  await db.exec(SUPABASE_STANDIN);
  const applied: string[] = [];
  const run = async (file: string, round: number) => {
    const sql = readFileSync(join(process.cwd(), "supabase", file), "utf8");
    try {
      await db.exec(sql);
    } catch (e) {
      throw new Error(`${file} (run ${round}) failed: ${(e as Error).message}`);
    }
    applied.push(`${file}#${round}`);
  };
  for (const file of MIGRATIONS) {
    // Existing data, as production has it before a migration runs.
    if (opts.before?.[file]) await opts.before[file](db);
    await run(file, 1);
  }
  for (const file of opts.rerun ?? []) await run(file, 2);
  return { db, applied };
}

export type As = { role: "anon" } | { role: "authenticated"; uid: string } | { role: "service_role" };

/**
 * Run `fn` as one API request would: a transaction with the role and JWT
 * claims PostgREST would set. Rolled back unless `commit` is true, so tests
 * stay independent.
 */
export async function asRequest<T>(db: Db, who: As, fn: (tx: Db) => Promise<T>, commit = false): Promise<T> {
  const claims = who.role === "authenticated" ? { sub: who.uid, role: "authenticated" } : { role: who.role };
  await db.exec("begin");
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await db.exec(`set local role ${who.role}`);
    const out = await fn(db);
    await db.exec(commit ? "commit" : "rollback");
    return out;
  } catch (e) {
    await db.exec("rollback").catch(() => undefined);
    throw e;
  }
}

/** Run a statement as a request and report whether the database refused it. */
export async function refused(db: Db, who: As, sql: string, params: unknown[] = []): Promise<{ refused: boolean; rows: number; error: string | null }> {
  try {
    const r = await asRequest(db, who, (tx) => tx.query(sql, params));
    return { refused: false, rows: r.rows.length + (r.affectedRows ?? 0), error: null };
  } catch (e) {
    return { refused: true, rows: 0, error: (e as Error).message };
  }
}

/** Rows a request can see. */
export async function rowsAs<T = Record<string, unknown>>(db: Db, who: As, sql: string, params: unknown[] = []): Promise<T[]> {
  return asRequest(db, who, async (tx) => (await tx.query<T>(sql, params)).rows);
}
