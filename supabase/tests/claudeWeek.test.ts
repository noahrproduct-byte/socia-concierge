// Videos the person's Claude hands in (supabase/claude-week.sql): each post
// links to its plan item and carries a review status the database keeps to
// waiting, approved or rejected. The file runs twice without harm.

import { beforeAll, describe, expect, it } from "vitest";
import { freshDatabase, refused, rowsAs, type Db } from "./harness";
import { seed, P, U } from "./seed";

let db: Db;
const as = (uid: string) => ({ role: "authenticated", uid }) as const;
const svc = { role: "service_role" } as const;

beforeAll(async () => {
  ({ db } = await freshDatabase({ before: { "security-hardening.sql": seed }, rerun: ["claude-week.sql"] }));
}, 180_000);

describe("scheduled_posts review columns", () => {
  it("keep the review status to waiting, approved or rejected", async () => {
    expect((await refused(db, svc, `update public.scheduled_posts set plan_item_id = 'item-1', review_status = 'waiting' where id = $1`, [P.A])).refused).toBe(false);
    expect((await refused(db, svc, `update public.scheduled_posts set review_status = 'posted' where id = $1`, [P.A])).refused).toBe(true);
    expect((await refused(db, svc, `update public.scheduled_posts set review_status = null where id = $1`, [P.A])).refused).toBe(false);
  });

  it("stay behind the post's own row rules", async () => {
    await db.query(`update public.scheduled_posts set review_status = 'waiting', review_note = 'too slow' where id = $1`, [P.B]);
    expect(await rowsAs(db, as(U.A), `select id from public.scheduled_posts where review_status is not null and id = $1`, [P.B])).toEqual([]);
    expect((await rowsAs<{ review_note: string }>(db, as(U.B), `select review_note from public.scheduled_posts where id = $1`, [P.B]))[0]?.review_note).toBe("too slow");
  });
});
