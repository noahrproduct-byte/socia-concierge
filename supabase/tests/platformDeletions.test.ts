// The deletion ledger (supabase/platform-deletions.sql) belongs to one brand
// owner, like every per-brand table.

import { beforeAll, describe, expect, it } from "vitest";
import { freshDatabase, refused, rowsAs, type Db } from "./harness";
import { seed, U, W } from "./seed";

let db: Db;
const anon = { role: "anon" } as const;
const as = (uid: string) => ({ role: "authenticated", uid }) as const;

beforeAll(async () => {
  ({ db } = await freshDatabase({ before: { "security-hardening.sql": seed }, rerun: ["platform-deletions.sql"] }));
  await db.exec(`
    insert into public.platform_deletions (user_id, workspace_id, platform, account_id, external_id) values
      ('${U.B}', '${W.WB}', 'youtube', 'UC-b', 'video-1');
  `);
}, 180_000);

describe("platform_deletions", () => {
  it("only the owner reads their record", async () => {
    expect((await rowsAs(db, as(U.B), `select id from public.platform_deletions`)).length).toBe(1);
    expect((await rowsAs(db, as(U.A), `select id from public.platform_deletions`)).length).toBe(0);
    expect((await refused(db, anon, `select id from public.platform_deletions`)).refused).toBe(true);
  });

  it("nobody writes a record as someone else or into someone else's workspace", async () => {
    expect((await refused(db, as(U.A), `insert into public.platform_deletions (user_id, platform, account_id, external_id) values ($1, 'youtube', 'x', 'y')`, [U.B])).refused).toBe(true);
    expect((await refused(db, as(U.A), `insert into public.platform_deletions (user_id, workspace_id, platform, account_id, external_id) values ($1, $2, 'youtube', 'x', 'y')`, [U.A, W.WB])).refused).toBe(true);
    expect((await refused(db, as(U.A), `update public.platform_deletions set caption = 'x' where user_id = $1`, [U.B])).rows).toBe(0);
    // Control: the owner records into their own brand.
    expect((await refused(db, as(U.A), `insert into public.platform_deletions (user_id, workspace_id, platform, account_id, external_id) values ($1, $2, 'youtube', 'x', 'y')`, [U.A, W.WA])).refused).toBe(false);
  });
});
