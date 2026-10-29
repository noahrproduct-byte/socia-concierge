// Re-running an older migration must not undo a security fix. Each file that
// says it is safe to run again is applied once more on top of the complete
// database, and the security invariants are checked afterwards. (schema.sql
// and the files marked DO NOT RUN are run-once by design and are excluded.)

import { describe, expect, it } from "vitest";
import { freshDatabase, MIGRATIONS, type Db } from "./harness";

const RUN_ONCE = new Set(["schema.sql", "plans-and-usage.sql"]);
const RERUNNABLE = MIGRATIONS.filter((f) => !RUN_ONCE.has(f));

/** Every rule a re-run could break, as a list of what is wrong (empty = fine). */
async function invariants(db: Db): Promise<string[]> {
  const bad: string[] = [];
  const q = async <T>(sql: string) => (await db.query<T>(sql)).rows;

  for (const t of ["instagram_connections", "facebook_connections", "youtube_connections", "tiktok_connections", "facebook_pending_tokens"]) {
    const [r] = await q<{ a: boolean; n: boolean }>(`select has_table_privilege('authenticated', 'public.${t}', 'select') as a, has_table_privilege('anon', 'public.${t}', 'select') as n`);
    if (r.a || r.n) bad.push(`${t} readable by the browser`);
  }
  const anon = await q<{ t: string }>(`select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and has_table_privilege('anon', c.oid, 'select')`);
  if (anon.length) bad.push(`anon can select ${anon.map((r) => r.t).join(", ")}`);

  const pol = await q<{ t: string; p: string; qual: string | null }>(`select tablename as t, policyname as p, qual from pg_policies where schemaname in ('public', 'storage')`);
  if (pol.some((p) => p.t === "objects" && /public read/i.test(p.p))) bad.push("storage: public listing policy is back");
  if (pol.some((p) => p.t === "workspace_invites" && p.p === "workspace_invites manage")) bad.push("invites: the open Admin policy is back");
  if (pol.some((p) => /^\s*true\s*$/.test(p.qual ?? "") && !["plan_config_overrides", "publisher_heartbeat"].includes(p.t))) bad.push("a USING (true) policy appeared");

  const [cols] = await q<{ inv_tok: boolean; mem_uid: boolean; alert_title: boolean }>(`select
    has_column_privilege('authenticated', 'public.workspace_invites', 'token', 'update') as inv_tok,
    has_column_privilege('authenticated', 'public.workspace_members', 'user_id', 'update') as mem_uid,
    has_column_privilege('authenticated', 'public.alert_events', 'title', 'update') as alert_title`);
  if (cols.inv_tok) bad.push("invites: token editable again");
  if (cols.mem_uid) bad.push("members: user_id editable again");
  if (cols.alert_title) bad.push("alerts: content editable again");

  const definers = await q<{ f: string }>(`select p.proname as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and p.prosrc like '%socia_is_privileged%'`);
  if (definers.length) bad.push(`guard triggers run as definer again: ${definers.map((r) => r.f).join(", ")}`);
  const exec = await q<{ f: string }>(`select p.proname as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
      and p.proname not in ('socia_is_ws_owner', 'socia_ws_role')`);
  if (exec.length) bad.push(`anon can run ${exec.map((r) => r.f).join(", ")}`);
  const userFns = await q<{ f: string }>(`select p.proname as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and pg_get_function_identity_arguments(p.oid) ~ 'p_user'
      and has_function_privilege('authenticated', p.oid, 'execute')`);
  if (userFns.length) bad.push(`a session can run ${userFns.map((r) => r.f).join(", ")}`);
  const path = await q<{ f: string }>(`select p.proname as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'socia\\_%' and not coalesce(p.proconfig::text, '') ~ 'search_path=public, pg_temp'`);
  if (path.length) bad.push(`search_path loosened: ${path.map((r) => r.f).join(", ")}`);
  return bad;
}

describe("re-running a migration keeps every security fix", () => {
  it("holds after all migrations, as a baseline", async () => {
    const { db } = await freshDatabase();
    expect(await invariants(db)).toEqual([]);
  }, 180_000);

  it.each(RERUNNABLE)("%s", async (file) => {
    const { db } = await freshDatabase({ rerun: [file] });
    expect(await invariants(db)).toEqual([]);
  }, 180_000);
});
