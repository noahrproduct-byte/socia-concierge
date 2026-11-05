// Working as a team (supabase/team-work.sql): who made a post, drafts marked
// ready for review, and plan posts handed to a person. Tasks are readable by
// the workspace's own people only and written by SOCIA's server only. The
// file runs twice without harm.

import { beforeAll, describe, expect, it } from "vitest";
import { freshDatabase, refused, rowsAs, type Db } from "./harness";
import { seed, P, U, W } from "./seed";

let db: Db;
const as = (uid: string) => ({ role: "authenticated", uid }) as const;
const svc = { role: "service_role" } as const;
const PLAN = "cccccccc-5555-4000-8000-000000000005";
const PLAN_B = "bbbbbbbb-5555-4000-8000-000000000005";

beforeAll(async () => {
  ({ db } = await freshDatabase({ before: { "security-hardening.sql": seed }, rerun: ["team-work.sql"] }));
  await db.exec(`
    insert into public.plans (id, user_id, data) values ('${PLAN}', '${U.O}', '{}'::jsonb), ('${PLAN_B}', '${U.B}', '{}'::jsonb);
    insert into public.plan_tasks (user_id, workspace_id, plan_id, plan_item_id, day, title, assignee_id, assigned_by)
      values ('${U.O}', '${W.W1}', '${PLAN}', 'item-1', 'Thursday', 'Walk in through the door', '${U.M}', '${U.O}');
  `);
}, 180_000);

describe("scheduled_posts.created_by", () => {
  it("is filled with the person saving through their own session", async () => {
    const rows = await rowsAs<{ created_by: string }>(db, as(U.A), `insert into public.scheduled_posts (user_id, workspace_id, scheduled_at, caption, status) values ($1, $2, now(), 'mine', 'draft') returning created_by`, [U.A, W.WA]);
    expect(rows[0]?.created_by).toBe(U.A);
  });

  it("stays empty for a server save until the server stamps it", async () => {
    const rows = await rowsAs<{ created_by: string | null }>(db, svc, `insert into public.scheduled_posts (user_id, workspace_id, scheduled_at, caption, status) values ($1, $2, now(), 'by a member', 'draft') returning created_by`, [U.O, W.W1]);
    expect(rows[0]?.created_by).toBeNull();
  });

  it("keeps the ready columns behind the post's own row rules", async () => {
    await db.query(`update public.scheduled_posts set ready_at = now(), ready_by = $2, ready_note = 'check the logo' where id = $1`, [P.B, U.B]);
    expect(await rowsAs(db, as(U.A), `select id from public.scheduled_posts where id = $1`, [P.B])).toEqual([]);
  });
});

describe("plan_tasks", () => {
  it("can be read by the workspace's owner, Admin and Member", async () => {
    for (const who of [U.O, U.AD, U.M]) {
      expect((await rowsAs(db, as(who), `select id from public.plan_tasks where plan_id = $1`, [PLAN])).length).toBe(1);
    }
  });

  it("can't be read by anyone else", async () => {
    for (const who of [U.A, U.B, U.N]) {
      expect(await rowsAs(db, as(who), `select id from public.plan_tasks`)).toEqual([]);
    }
    expect((await refused(db, { role: "anon" }, `select id from public.plan_tasks`)).rows).toBe(0);
  });

  it("can't be written from a session, even by the owner or the assignee", async () => {
    for (const who of [U.O, U.M]) {
      expect((await refused(db, as(who), `update public.plan_tasks set status = 'done' where plan_id = $1`, [PLAN])).refused).toBe(true);
      expect((await refused(db, as(who), `delete from public.plan_tasks where plan_id = $1`, [PLAN])).refused).toBe(true);
    }
    expect((await refused(db, as(U.B), `insert into public.plan_tasks (user_id, workspace_id, plan_id, plan_item_id, title, assignee_id) values ($1, $2, $3, 'x', 'x', $1)`, [U.B, W.WB, PLAN_B])).refused).toBe(true);
  });

  it("holds one person per plan post and only open or done", async () => {
    expect((await refused(db, svc, `insert into public.plan_tasks (user_id, workspace_id, plan_id, plan_item_id, title, assignee_id) values ($1, $2, $3, 'item-1', 'again', $4)`, [U.O, W.W1, PLAN, U.AD])).refused).toBe(true);
    expect((await refused(db, svc, `update public.plan_tasks set status = 'filmed' where plan_id = $1`, [PLAN])).refused).toBe(true);
    expect((await refused(db, svc, `update public.plan_tasks set status = 'done', done_at = now(), done_by = $2 where plan_id = $1`, [PLAN, U.M])).refused).toBe(false);
  });

  it("goes when its plan goes", async () => {
    await db.query(`delete from public.plans where id = $1`, [PLAN]);
    expect((await db.query(`select id from public.plan_tasks where plan_id = $1`, [PLAN])).rows).toEqual([]);
  });
});
