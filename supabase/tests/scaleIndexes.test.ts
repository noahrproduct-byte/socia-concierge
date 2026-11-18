// supabase/scale-indexes.sql: the indexes are made on a full database, the
// file can be run twice, and it does nothing (and does not fail) on a
// database where the tables are missing.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { freshDatabase, type Db } from "./harness";

const SQL = readFileSync(join(__dirname, "..", "scale-indexes.sql"), "utf8");
const NAMES = [...SQL.matchAll(/create index if not exists (\w+)/g)].map((m) => m[1]);

let db: Db;
beforeAll(async () => {
  ({ db } = await freshDatabase());
}, 180_000);

const made = async (d: { query: (q: string) => Promise<{ rows: unknown[] }> }) =>
  ((await d.query("select indexname from pg_indexes where schemaname = 'public'")).rows as { indexname: string }[]).map((r) => r.indexname);

describe("scale-indexes.sql", () => {
  it("names every index once", () => {
    expect(NAMES.length).toBeGreaterThan(8);
    expect(new Set(NAMES).size).toBe(NAMES.length);
  });
  it("makes the indexes for every table the test database has, and can run again", async () => {
    await db.exec(SQL);
    await db.exec(SQL);
    const have = await made(db);
    const tables = ((await db.query("select tablename from pg_tables where schemaname = 'public'")).rows as { tablename: string }[]).map((r) => r.tablename);
    for (const m of SQL.matchAll(/create index if not exists (\w+) on public\.(\w+)/g)) {
      if (tables.includes(m[2])) expect(have, `${m[1]} on ${m[2]}`).toContain(m[1]);
    }
    // The core tables are always there, so these must exist.
    for (const n of ["scheduled_posts_plan_idx", "account_snapshots_day_idx", "alert_events_unread_idx", "platform_snapshots_account_day_idx"]) expect(have).toContain(n);
  });
  it("does nothing on a database without the tables", async () => {
    const empty = new PGlite();
    await empty.exec(SQL);
    expect(await made(empty)).toEqual([]);
    await empty.close();
  });
});
