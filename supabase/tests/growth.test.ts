// The Growth Profile tables (supabase/growth-profile.sql): goals and
// onboarding progress belong to one brand owner, like every per-brand table.

import { beforeAll, describe, expect, it } from "vitest";
import { freshDatabase, refused, rowsAs, type Db } from "./harness";
import { seed, U, W } from "./seed";

let db: Db;
const anon = { role: "anon" } as const;
const as = (uid: string) => ({ role: "authenticated", uid }) as const;
const service = { role: "service_role" } as const;

beforeAll(async () => {
  ({ db } = await freshDatabase({ before: { "security-hardening.sql": seed }, rerun: ["growth-profile.sql"] }));
  await db.exec(`
    insert into public.growth_goals (user_id, workspace_id, metric, platforms, baseline, target) values
      ('${U.A}', '${W.WA}', 'followers', '{instagram}', 1200, 2000),
      ('${U.O}', '${W.W1}', 'bookings', '{}', null, 40);
    insert into public.onboarding_state (user_id, workspace_id, step) values
      ('${U.A}', '${W.WA}', 'goals'),
      ('${U.O}', '${W.W1}', 'connect');
  `);
}, 180_000);

describe("growth_goals and onboarding_state", () => {
  it("each owner sees only their own rows", async () => {
    for (const t of ["growth_goals", "onboarding_state"]) {
      expect((await rowsAs(db, as(U.A), `select id from public.${t}`)).length).toBe(1);
      expect((await rowsAs(db, as(U.B), `select id from public.${t}`)).length).toBe(0);
    }
  });

  it("signed-out visitors and a workspace's Admin or Member read nothing directly", async () => {
    for (const t of ["growth_goals", "onboarding_state"]) {
      expect((await refused(db, anon, `select id from public.${t}`)).refused).toBe(true);
      for (const who of [U.AD, U.M]) expect((await rowsAs(db, as(who), `select id from public.${t}`)).length).toBe(0);
    }
  });

  it("nobody can write a goal or progress row as someone else, or into someone else's workspace", async () => {
    expect((await refused(db, as(U.B), `insert into public.growth_goals (user_id, workspace_id, metric, target) values ($1, $2, 'followers', 10)`, [U.A, W.WA])).refused).toBe(true);
    expect((await refused(db, as(U.B), `insert into public.growth_goals (user_id, workspace_id, metric, target) values ($1, $2, 'followers', 10)`, [U.B, W.WA])).refused).toBe(true);
    expect((await refused(db, as(U.B), `insert into public.onboarding_state (user_id, workspace_id) values ($1, $2)`, [U.B, W.W1])).refused).toBe(true);
    expect((await refused(db, as(U.B), `update public.growth_goals set target = 1 where user_id = $1`, [U.A])).rows).toBe(0);
    expect((await refused(db, as(U.B), `delete from public.onboarding_state where user_id = $1`, [U.A])).rows).toBe(0);
    // Control: the owner can add to their own brand.
    expect((await refused(db, as(U.B), `insert into public.growth_goals (user_id, workspace_id, metric, target) values ($1, $2, 'followers', 10)`, [U.B, W.WB])).refused).toBe(false);
  });

  it("keeps one progress row per brand and refuses impossible goals", async () => {
    expect((await refused(db, service, `insert into public.onboarding_state (user_id, workspace_id) values ($1, $2)`, [U.A, W.WA])).refused).toBe(true);
    expect((await refused(db, service, `insert into public.growth_goals (user_id, workspace_id, metric, target) values ($1, $2, 'followers', 0)`, [U.A, W.WA])).refused).toBe(true);
    expect((await refused(db, service, `insert into public.growth_goals (user_id, workspace_id, metric, target, status) values ($1, $2, 'followers', 5, 'maybe')`, [U.A, W.WA])).refused).toBe(true);
  });
});
