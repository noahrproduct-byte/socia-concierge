// SOCIA's database security model, as rules a migration can't quietly break.
// The database is built exactly as production runs its migrations
// (harness.ts); these tests read the catalog and fail on anything that
// loosens the model: a table without row-level security, a policy that lets
// everyone in without a recorded reason, a policy anonymous visitors can
// pass, a function with a movable search_path, or a privileged function a
// browser session can call.

import { beforeAll, describe, expect, it } from "vitest";
import { freshDatabase, type Db } from "./harness";

let db: Db;
const rows = async <T>(sql: string) => (await db.query<T>(sql)).rows;

beforeAll(async () => {
  ({ db } = await freshDatabase());
}, 180_000);

/**
 * Policies that admit every signed-in person, and why that is safe. Nothing
 * else may use `true`.
 */
const OPEN_POLICIES: Record<string, string> = {
  "plan_config_overrides SELECT": "plan limits and prices, the same numbers the pricing page shows",
  "publisher_heartbeat SELECT": "when the publisher last ran and how many posts it handled; no customer data",
};

describe("every table", () => {
  it("has row-level security on", async () => {
    const off = await rows<{ t: string }>(`select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`);
    expect(off.map((r) => r.t)).toEqual([]);
  });

  it("is reachable through a policy only by name of the caller or their workspace role", async () => {
    const ps = await rows<{ t: string; cmd: string; qual: string | null; wc: string | null }>(`
      select tablename as t, cmd, qual, with_check as wc from pg_policies where schemaname = 'public'`);
    const loose: string[] = [];
    for (const p of ps) {
      const key = `${p.t} ${p.cmd}`;
      const text = `${p.qual ?? ""} ${p.wc ?? ""}`;
      if (/^\s*true\s*$/.test(p.qual ?? "") || /^\s*true\s*$/.test(p.wc ?? "")) {
        if (!OPEN_POLICIES[key]) loose.push(`${key}: true`);
        continue;
      }
      // Every other policy must name the caller: auth.uid(), or a helper that reads it.
      if (!/auth\.uid\(\)|socia_ws_role|socia_is_ws_owner|socia_niche_key_is_mine/.test(text)) loose.push(`${key}: ${text.trim().slice(0, 80)}`);
    }
    expect(loose).toEqual([]);
  });

  it("gives signed-out visitors no policy to pass", async () => {
    // Policies "to public" also apply to anon; each one must need a signed-in id.
    const ps = await rows<{ t: string; cmd: string; roles: string; qual: string | null; wc: string | null }>(`
      select tablename as t, cmd, roles::text as roles, qual, with_check as wc from pg_policies where schemaname in ('public', 'storage')`);
    const anonOpen = ps.filter((p) => /public|anon/.test(p.roles) && !/auth\.uid\(\)|socia_ws_role|socia_is_ws_owner|socia_niche_key_is_mine/.test(`${p.qual ?? ""} ${p.wc ?? ""}`));
    expect(anonOpen.map((p) => `${p.t} ${p.cmd}`)).toEqual([]);
  });

  it("gives the anon key no table privileges at all, now or for tables created later", async () => {
    const t = await rows<{ t: string }>(`select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert')
          or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete'))`);
    expect(t.map((r) => r.t)).toEqual([]);
    await db.exec(`create table public.zz_later (id int primary key)`);
    expect((await rows<{ ok: boolean }>(`select has_table_privilege('anon', 'public.zz_later', 'select') as ok`))[0].ok).toBe(false);
    await db.exec(`drop table public.zz_later`);
  });

  it("allows only the documented open policies to everyone signed in", () => {
    expect(Object.keys(OPEN_POLICIES).sort()).toEqual(["plan_config_overrides SELECT", "publisher_heartbeat SELECT"]);
  });
});

describe("every function", () => {
  it("has a fixed search_path that can't be redirected through pg_temp", async () => {
    const fs = await rows<{ f: string; cfg: string | null }>(`
      select p.oid::regprocedure::text as f, p.proconfig::text as cfg from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'`);
    const movable = fs.filter((f) => !/search_path=public, pg_temp\b/.test(f.cfg ?? ""));
    expect(movable.map((f) => `${f.f} ${f.cfg ?? "(none)"}`)).toEqual([]);
  });

  it("that takes a user id runs only for SOCIA's server", async () => {
    const fs = await rows<{ f: string }>(`
      select p.oid::regprocedure::text as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef and pg_get_function_identity_arguments(p.oid) ~ '(p_user|p_owner)'
        and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))`);
    expect(fs.map((f) => f.f)).toEqual([]);
  });
});

describe("every browser-writable table with a workspace", () => {
  it("refuses a workspace the caller doesn't own (guard trigger)", async () => {
    const t = await rows<{ t: string }>(`
      select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and exists (select 1 from information_schema.columns k where k.table_schema = 'public' and k.table_name = c.relname and k.column_name = 'workspace_id')
        -- A session can really write workspace_id: the column privilege and a policy for that command.
        and ((has_column_privilege('authenticated', c.oid, 'workspace_id', 'insert')
              and exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname and p.cmd in ('INSERT', 'ALL')))
          or (has_column_privilege('authenticated', c.oid, 'workspace_id', 'update')
              and exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname and p.cmd in ('UPDATE', 'ALL'))))
        and c.relname not in ('workspace_invites', 'workspace_members')
        and not exists (select 1 from pg_trigger g where g.tgrelid = c.oid and g.tgname = 'socia_guard_workspace_fk')`);
    // workspace_invites/members: an Admin writes into a workspace it doesn't own; their policies check the role.
    expect(t.map((r) => r.t)).toEqual([]);
  });
});
