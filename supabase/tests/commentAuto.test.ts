// Automatic comment replies (supabase/comment-auto.sql): a brand's setting is
// read by its owner and switched only by SOCIA's server, which checks the role
// and the plan. The new draft columns default to "not sent automatically".

import { beforeAll, describe, expect, it } from "vitest";
import { freshDatabase, refused, rowsAs, type Db } from "./harness";
import { seed, U, W } from "./seed";

let db: Db;
const anon = { role: "anon" } as const;
const as = (uid: string) => ({ role: "authenticated", uid }) as const;

beforeAll(async () => {
  ({ db } = await freshDatabase({ before: { "security-hardening.sql": seed }, rerun: ["comment-auto.sql"] }));
  await db.exec(`insert into public.comment_auto_settings (user_id, workspace_id, enabled, enabled_at) values ('${U.B}', '${W.WB}', true, now());`);
}, 180_000);

describe("comment_auto_settings", () => {
  it("the owner reads their brand's setting; nobody else does", async () => {
    expect((await rowsAs(db, as(U.B), `select enabled from public.comment_auto_settings`)).length).toBe(1);
    expect((await rowsAs(db, as(U.A), `select enabled from public.comment_auto_settings`)).length).toBe(0);
    expect((await refused(db, anon, `select enabled from public.comment_auto_settings`)).refused).toBe(true);
  });

  it("can't be switched from the browser, even by the owner", async () => {
    expect((await refused(db, as(U.B), `update public.comment_auto_settings set enabled = false where user_id = $1`, [U.B])).refused).toBe(true);
    expect((await refused(db, as(U.A), `insert into public.comment_auto_settings (user_id, workspace_id, enabled) values ($1, $2, true)`, [U.A, W.WA])).refused).toBe(true);
    expect((await refused(db, as(U.B), `delete from public.comment_auto_settings where user_id = $1`, [U.B])).refused).toBe(true);
  });
});

describe("comment_drafts automatic columns", () => {
  it("start as not judged and not sent automatically", async () => {
    await db.exec(`insert into public.comment_drafts (user_id, workspace_id, platform, account_id, post_id, comment_id) values ('${U.B}', '${W.WB}', 'instagram', 'ig-b', 'm1', 'c-auto-1');`);
    const [row] = await rowsAs<{ auto_ok: boolean | null; sent_automatically: boolean }>(db, as(U.B), `select auto_ok, sent_automatically from public.comment_drafts where comment_id = 'c-auto-1'`);
    expect(row).toEqual({ auto_ok: null, sent_automatically: false });
  });
});
