// The shared intelligence store (supabase/intelligence.sql): findings and
// job records belong to one brand owner, like every per-brand table.

import { beforeAll, describe, expect, it } from "vitest";
import { freshDatabase, refused, rowsAs, type Db } from "./harness";
import { seed, U, W } from "./seed";

let db: Db;
const anon = { role: "anon" } as const;
const as = (uid: string) => ({ role: "authenticated", uid }) as const;
const service = { role: "service_role" } as const;

beforeAll(async () => {
  ({ db } = await freshDatabase({ before: { "security-hardening.sql": seed }, rerun: ["intelligence.sql"] }));
  await db.exec(`
    insert into public.insights (user_id, workspace_id, fingerprint, producer, category, title, observation) values
      ('${U.A}', '${W.WA}', 'ig:format:Reel', 'overview', 'content', 'Reels lead', 'Reels earn 2x the median');
    insert into public.intelligence_jobs (user_id, workspace_id, kind) values
      ('${U.A}', '${W.WA}', 'refresh_insights');
  `);
}, 180_000);

describe("insights and intelligence_jobs", () => {
  it("each owner sees only their own rows; signed-out visitors and team sessions see none", async () => {
    for (const t of ["insights", "intelligence_jobs"]) {
      expect((await rowsAs(db, as(U.A), `select id from public.${t}`)).length).toBe(1);
      expect((await rowsAs(db, as(U.B), `select id from public.${t}`)).length).toBe(0);
      expect((await refused(db, anon, `select id from public.${t}`)).refused).toBe(true);
      for (const who of [U.AD, U.M]) expect((await rowsAs(db, as(who), `select id from public.${t}`)).length).toBe(0);
    }
  });

  it("nobody writes a finding as someone else or into someone else's workspace", async () => {
    const ins = `insert into public.insights (user_id, workspace_id, fingerprint, producer, category, title, observation) values ($1, $2, 'x', 'p', 'content', 't', 'o')`;
    expect((await refused(db, as(U.B), ins, [U.A, W.WA])).refused).toBe(true);
    expect((await refused(db, as(U.B), ins, [U.B, W.WA])).refused).toBe(true);
    expect((await refused(db, as(U.B), `update public.insights set title = 'x' where user_id = $1`, [U.A])).rows).toBe(0);
    expect((await refused(db, as(U.B), ins, [U.B, W.WB])).refused).toBe(false);
  });

  it("keeps one finding per fingerprint per brand and refuses impossible values", async () => {
    const ins = `insert into public.insights (user_id, workspace_id, fingerprint, producer, category, title, observation, confidence, status) values ($1, $2, $3, 'p', $4, 't', 'o', $5, $6)`;
    expect((await refused(db, service, ins, [U.A, W.WA, "ig:format:Reel", "content", 50, "active"])).refused).toBe(true);
    expect((await refused(db, service, ins, [U.A, W.WA, "new", "vibes", 50, "active"])).refused).toBe(true);
    expect((await refused(db, service, ins, [U.A, W.WA, "new2", "content", 140, "active"])).refused).toBe(true);
    expect((await refused(db, service, ins, [U.A, W.WA, "new3", "content", 50, "maybe"])).refused).toBe(true);
  });
});
