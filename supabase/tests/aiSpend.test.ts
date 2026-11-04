// Each account's monthly AI cost (supabase/ai-spend.sql) is server only: the
// browser can't read it, add to it or reset it, and the counter adds atomically.

import { beforeAll, describe, expect, it } from "vitest";
import { asRequest, freshDatabase, refused, rowsAs, type Db } from "./harness";
import { seed, U } from "./seed";

let db: Db;
const as = (uid: string) => ({ role: "authenticated", uid }) as const;
const anon = { role: "anon" } as const;
const svc = { role: "service_role" } as const;

beforeAll(async () => {
  ({ db } = await freshDatabase({ before: { "security-hardening.sql": seed }, rerun: ["ai-spend.sql"] }));
}, 180_000);

describe("ai_spend", () => {
  it("adds each call's cost to the owner's month", async () => {
    for (const micros of [12000, 3000, -500]) {
      await asRequest(db, svc, (tx) => tx.query(`select public.socia_ai_spend_add($1, '2026-11-01', $2)`, [U.A, micros]), true);
    }
    const [row] = await rowsAs<{ micro_usd: string; calls: number }>(db, svc, `select micro_usd, calls from public.ai_spend where user_id = $1`, [U.A]);
    expect(Number(row.micro_usd)).toBe(15000);
    expect(row.calls).toBe(3);
  });

  it("can't be read, added to or reset from the browser", async () => {
    expect((await refused(db, as(U.A), `select micro_usd from public.ai_spend`)).refused).toBe(true);
    expect((await refused(db, anon, `select micro_usd from public.ai_spend`)).refused).toBe(true);
    expect((await refused(db, as(U.A), `select public.socia_ai_spend_add($1, '2026-11-01', -99999999)`, [U.A])).refused).toBe(true);
    expect((await refused(db, as(U.A), `delete from public.ai_spend where user_id = $1`, [U.A])).refused).toBe(true);
  });
});
