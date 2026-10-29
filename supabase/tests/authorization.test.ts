// Database authorization, tested against real Postgres with every migration
// applied in production order (supabase/tests/harness.ts). Each request runs
// exactly as Supabase REST would run it: the anon key, a signed-in person's
// session, or the service role.
//
// The claim being proven: one customer cannot read, change, delete or
// publish another customer's data, the browser can never reach a platform
// token, and inside an agency's workspaces an Admin or Member gets only what
// their role allows.

import { beforeAll, describe, expect, it } from "vitest";
import { freshDatabase, refused, rowsAs, type Db } from "./harness";
import { P, seed, TOKEN, U, W } from "./seed";

let db: Db;
let tables: { name: string; hasUser: boolean; hasOwner: boolean }[] = [];
const anon = { role: "anon" } as const;
const as = (uid: string) => ({ role: "authenticated", uid }) as const;
const service = { role: "service_role" } as const;
const TOKEN_TABLES = ["instagram_connections", "facebook_connections", "youtube_connections", "tiktok_connections", "facebook_pending_tokens"];

beforeAll(async () => {
  // Data exists before the hardening migration, as in production; then the
  // migration is applied a second time to prove it is idempotent.
  ({ db } = await freshDatabase({ before: { "security-hardening.sql": seed }, rerun: ["security-hardening.sql", "rls-audit.sql"] }));
  const r = await db.query<{ name: string; has_user: boolean; has_owner: boolean }>(`
    select c.relname as name,
      exists (select 1 from information_schema.columns k where k.table_schema = 'public' and k.table_name = c.relname and k.column_name = 'user_id') as has_user,
      exists (select 1 from information_schema.columns k where k.table_schema = 'public' and k.table_name = c.relname and k.column_name = 'owner_id') as has_owner
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' order by 1`);
  tables = r.rows.map((x) => ({ name: x.name, hasUser: x.has_user, hasOwner: x.has_owner }));
}, 180_000);

describe("the migration", () => {
  it("applies on existing data and again on top of itself", () => {
    expect(tables.length).toBeGreaterThan(35);
  });

  it("keeps every existing row", async () => {
    const n = async (t: string) => Number((await db.query<{ n: string }>(`select count(*)::text as n from public.${t}`)).rows[0].n);
    expect(await n("scheduled_posts")).toBe(4);
    expect(await n("post_destinations")).toBe(2);
    expect(await n("instagram_connections")).toBe(3);
    expect(await n("workspaces")).toBe(4);
  });

  it("removed the Page tokens already stored in a pending Facebook list, and kept the names", async () => {
    const r = await db.query<{ pending_pages: { id: string; name: string; access_token?: string }[] }>(`select pending_pages from public.facebook_connections where user_id = $1`, [U.A]);
    expect(r.rows[0].pending_pages.map((p) => p.name)).toEqual(["Page one", "Page two"]);
    expect(JSON.stringify(r.rows[0].pending_pages)).not.toContain("access_token");
  });

  it("enables row-level security on every table", async () => {
    const r = await db.query<{ relname: string }>(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    expect(r.rows.map((x) => x.relname)).toEqual([]);
  });
});

describe("the anon key, signed out", () => {
  it("sees no row in any table", async () => {
    const seen: string[] = [];
    for (const t of tables) {
      const r = await refused(db, anon, `select 1 from public.${t.name} limit 1`);
      if (!r.refused && r.rows > 0) seen.push(t.name);
    }
    expect(seen).toEqual([]);
  });

  it("can't list or read any stored file", async () => {
    expect((await refused(db, anon, `select name from storage.objects`)).rows).toBe(0);
  });

  it("can't write anything", async () => {
    expect((await refused(db, anon, `insert into public.scheduled_posts (user_id, scheduled_at) values ($1, now())`, [U.A])).refused).toBe(true);
    expect((await refused(db, anon, `insert into storage.objects (bucket_id, name) values ('scheduled-media', 'x/y.jpg')`)).refused).toBe(true);
  });
});

describe("customer B against customer A", () => {
  it("can't see any of A's rows, in any table", async () => {
    const seen: string[] = [];
    for (const t of tables) {
      const col = t.hasUser ? "user_id" : t.hasOwner ? "owner_id" : null;
      if (!col) continue;
      const r = await refused(db, as(U.B), `select 1 from public.${t.name} where ${col} = $1 limit 1`, [U.A]);
      if (!r.refused && r.rows > 0) seen.push(t.name);
    }
    expect(seen).toEqual([]);
  });

  it("can't change or delete any of A's rows, in any table", async () => {
    const changed: string[] = [];
    for (const t of tables) {
      const col = t.hasUser ? "user_id" : t.hasOwner ? "owner_id" : null;
      if (!col) continue;
      const u = await refused(db, as(U.B), `update public.${t.name} set ${col} = ${col} where ${col} = $1`, [U.A]);
      const d = await refused(db, as(U.B), `delete from public.${t.name} where ${col} = $1`, [U.A]);
      if (!u.refused && u.rows > 0) changed.push(`${t.name} update`);
      if (!d.refused && d.rows > 0) changed.push(`${t.name} delete`);
    }
    expect(changed).toEqual([]);
  });

  it("can't create rows in A's name", async () => {
    expect((await refused(db, as(U.B), `insert into public.scheduled_posts (user_id, scheduled_at) values ($1, now())`, [U.A])).refused).toBe(true);
    expect((await refused(db, as(U.B), `insert into public.plans (user_id, data) values ($1, '{}')`, [U.A])).refused).toBe(true);
  });

  it("can't attach a destination to A's post (so can't publish A's content anywhere)", async () => {
    const r = await refused(db, as(U.B), `insert into public.post_destinations (post_id, user_id, platform, account_id, status) values ($1, $2, 'instagram', 'ig-b', 'scheduled')`, [P.A, U.B]);
    expect(r.refused).toBe(true);
    // ...and can't move their own destination onto A's post either.
    const m = await refused(db, as(U.B), `update public.post_destinations set post_id = $1 where user_id = $2`, [P.A, U.B]);
    expect(m.refused).toBe(true);
  });

  it("can't put a row into A's workspace", async () => {
    expect((await refused(db, as(U.B), `insert into public.scheduled_posts (user_id, workspace_id, scheduled_at) values ($1, $2, now())`, [U.B, W.WA])).refused).toBe(true);
    expect((await refused(db, as(U.B), `update public.scheduled_posts set workspace_id = $1 where user_id = $2`, [W.WA, U.B])).refused).toBe(true);
  });

  it("can't list, read, overwrite or delete A's files", async () => {
    const names = (await rowsAs<{ name: string }>(db, as(U.B), `select name from storage.objects`)).map((r) => r.name);
    expect(names).toEqual([`${U.B}/${P.B}/1_unreleased.mp4`]);
    expect((await refused(db, as(U.B), `insert into storage.objects (bucket_id, name, owner) values ('scheduled-media', $1, $2)`, [`${U.A}/${P.A}/evil.jpg`, U.B])).refused).toBe(true);
    expect((await refused(db, as(U.B), `update storage.objects set name = name where name like $1`, [`${U.A}/%`])).rows).toBe(0);
    expect((await refused(db, as(U.B), `delete from storage.objects where name like $1`, [`${U.A}/%`])).rows).toBe(0);
    expect((await refused(db, as(U.B), `select name from storage.objects where bucket_id = 'studio-sources'`)).rows).toBe(0);
  });

  it("still works on B's own data (control)", async () => {
    expect((await rowsAs(db, as(U.B), `select id from public.scheduled_posts`)).length).toBe(1);
    expect((await refused(db, as(U.B), `update public.scheduled_posts set caption = 'edited' where id = $1`, [P.B])).rows).toBe(1);
    expect((await refused(db, as(U.B), `insert into public.post_destinations (post_id, user_id, workspace_id, platform, account_id) values ($1, $2, $3, 'facebook', 'page-b')`, [P.B, U.B, W.WB])).refused).toBe(false);
  });
});

describe("platform tokens", () => {
  it("are unreachable from any browser session, even the person's own", async () => {
    const reached: string[] = [];
    for (const t of TOKEN_TABLES) {
      for (const who of [anon, as(U.A), as(U.B), as(U.O)]) {
        const r = await refused(db, who, `select * from public.${t} limit 1`);
        if (!r.refused) reached.push(`${t} as ${who.role}${"uid" in who ? ` ${who.uid.slice(0, 2)}` : ""}`);
      }
    }
    expect(reached).toEqual([]);
  });

  it("can't be written from a browser session either", async () => {
    expect((await refused(db, as(U.A), `insert into public.instagram_connections (user_id, ig_user_id, access_token) values ($1, 'stolen', 'x')`, [U.A])).refused).toBe(true);
    expect((await refused(db, as(U.A), `update public.instagram_connections set access_token = 'x' where user_id = $1`, [U.A])).refused).toBe(true);
    expect((await refused(db, as(U.A), `delete from public.instagram_connections where user_id = $1`, [U.A])).refused).toBe(true);
  });

  it("are readable by SOCIA's server role (refresh and publishing keep working)", async () => {
    const r = await rowsAs<{ access_token: string }>(db, service, `select access_token from public.instagram_connections where user_id = $1`, [U.A]);
    expect(r[0].access_token).toBe(TOKEN("A"));
    const y = await rowsAs<{ refresh_token: string }>(db, service, `select refresh_token from public.youtube_connections where user_id = $1`, [U.B]);
    expect(y[0].refresh_token).toBe("1//refresh-secret-B");
  });
});

describe("workspaces and plans", () => {
  it("a browser session can create only its first workspace", async () => {
    expect((await refused(db, as(U.N), `insert into public.workspaces (owner_id, name, is_default) values ($1, 'First', true)`, [U.N])).refused).toBe(false);
    expect((await refused(db, as(U.A), `insert into public.workspaces (owner_id, name) values ($1, 'Extra')`, [U.A])).refused).toBe(true);
  });

  it("nobody can give themselves a paid plan or move a pause flag", async () => {
    expect((await refused(db, as(U.A), `update public.profiles set plan = 'pro' where user_id = $1`, [U.A])).refused).toBe(true);
    expect((await refused(db, as(U.A), `update public.profiles set trial_end = now() + interval '1 year' where user_id = $1`, [U.A])).refused).toBe(true);
    expect((await refused(db, as(U.A), `update public.profiles set entitlement_overrides = '{"studio": true}' where user_id = $1`, [U.A])).refused).toBe(true);
    expect((await refused(db, as(U.O), `update public.workspaces set plan_suspended_at = now() where id = $1`, [W.W2])).refused).toBe(true);
    // Their own profile otherwise stays editable (control).
    expect((await refused(db, as(U.A), `update public.profiles set active_workspace_id = $2 where user_id = $1`, [U.A, W.WA])).refused).toBe(false);
  });
});

describe("inside an agency's workspaces (owner O, Admin and Member of W1)", () => {
  it("an Admin's or Member's own session sees none of the owner's data (the server acts for them, by role)", async () => {
    for (const who of [U.AD, U.M]) {
      expect((await rowsAs(db, as(who), `select id from public.scheduled_posts`)).length).toBe(0);
      expect((await rowsAs(db, as(who), `select id from public.studio_projects`)).length).toBe(0);
      expect((await rowsAs(db, as(who), `select id from public.comment_drafts`)).length).toBe(0);
    }
  });

  it("sees only the workspace they belong to, not the owner's other brand", async () => {
    const ids = (await rowsAs<{ id: string }>(db, as(U.M), `select id from public.workspaces`)).map((r) => r.id);
    expect(ids).toEqual([W.W1]);
  });

  it("a Member can't read invite tokens", async () => {
    expect((await rowsAs(db, as(U.M), `select id from public.workspace_invites`)).length).toBe(0);
    expect((await refused(db, as(U.M), `insert into public.workspace_invites (workspace_id, role, token, created_by) values ($1, 'member', 'm-made', $2)`, [W.W1, U.M])).refused).toBe(true);
  });

  it("an Admin handles Member invites only: can't see, mint or forge an Admin link", async () => {
    const roles = (await rowsAs<{ role: string }>(db, as(U.AD), `select role from public.workspace_invites`)).map((r) => r.role);
    expect(roles).toEqual(["member"]);
    expect((await refused(db, as(U.AD), `insert into public.workspace_invites (workspace_id, role, token, created_by) values ($1, 'admin', 'ad-made', $2)`, [W.W1, U.AD])).refused).toBe(true);
    expect((await refused(db, as(U.AD), `insert into public.workspace_invites (workspace_id, role, token, created_by) values ($1, 'member', 'ad-member', $2)`, [W.W1, U.AD])).refused).toBe(false);
    expect((await refused(db, as(U.AD), `update public.workspace_invites set role = 'admin' where role = 'member'`)).refused).toBe(true);
    expect((await refused(db, as(U.AD), `update public.workspace_invites set token = 'mine' where role = 'member'`)).refused).toBe(true);
    expect((await refused(db, as(U.AD), `update public.workspace_invites set revoked_at = now() where role = 'member'`)).rows).toBe(1);
    expect((await refused(db, as(U.AD), `update public.workspace_invites set revoked_at = now() where role = 'admin'`)).rows).toBe(0);
  });

  it("the owner still sees and cancels every invite (control)", async () => {
    expect((await rowsAs(db, as(U.O), `select id from public.workspace_invites`)).length).toBe(2);
    expect((await refused(db, as(U.O), `insert into public.workspace_invites (workspace_id, role, token, created_by) values ($1, 'admin', 'o-admin', $2)`, [W.W1, U.O])).refused).toBe(false);
    expect((await refused(db, as(U.O), `update public.workspace_invites set revoked_at = now()`)).rows).toBe(2);
  });

  it("a Member can mark an alert read but can't rewrite it", async () => {
    expect((await refused(db, as(U.M), `update public.alert_events set title = 'spoofed'`)).refused).toBe(true);
    expect((await refused(db, as(U.M), `update public.alert_events set recipient_id = $1`, [U.M])).refused).toBe(true);
    expect((await refused(db, as(U.M), `update public.alert_events set read_at = now()`)).refused).toBe(false);
  });

  it("only the owner changes roles, and nobody can swap who a member is", async () => {
    expect((await refused(db, as(U.AD), `update public.workspace_members set role = 'admin' where user_id = $1`, [U.M])).rows).toBe(0);
    expect((await refused(db, as(U.M), `update public.workspace_members set role = 'admin' where user_id = $1`, [U.M])).rows).toBe(0);
    expect((await refused(db, as(U.O), `update public.workspace_members set user_id = $1 where user_id = $2`, [U.N, U.M])).refused).toBe(true);
    expect((await refused(db, as(U.O), `update public.workspace_members set role = 'admin' where user_id = $1`, [U.M])).rows).toBe(1);
  });

  it("no browser session can add itself to a workspace", async () => {
    expect((await refused(db, as(U.N), `insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, 'admin')`, [W.W1, U.N])).refused).toBe(true);
  });
});

describe("database functions", () => {
  const definers = async (role: string) =>
    (await db.query<{ proname: string; src: string; args: string }>(`
      select p.proname, p.prosrc as src, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef and has_function_privilege($1, p.oid, 'execute') order by 1`, [role])).rows;

  it("the anon key can run only the two policy helpers, which answer for the caller alone", async () => {
    // Row-level policies call these; without a session they return false/null.
    expect((await definers("anon")).map((x) => x.proname)).toEqual(["socia_is_ws_owner", "socia_ws_role"]);
  });

  it("a signed-in session can run only functions that act on its own id", async () => {
    const fns = await definers("authenticated");
    expect(fns.map((x) => x.proname)).toEqual(SESSION_FUNCTIONS);
    // Each reads auth.uid() itself, and none takes a user id from the caller.
    for (const f of fns) {
      expect(f.src, f.proname).toContain("auth.uid()");
      expect(f.args, f.proname).not.toMatch(/p_user|user_id|owner/);
    }
  });

  it("the guard triggers really run as the caller (a definer guard would let every write through)", async () => {
    const r = await db.query<{ proname: string }>(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef and p.prosrc like '%socia_is_privileged%'`);
    expect(r.rows.map((x) => x.proname)).toEqual([]);
  });

  it("the rate limiter can't be used by a browser to lock someone out", async () => {
    expect((await refused(db, anon, `select public.socia_rate_hit('user:x:transcribe', 3600, 1)`)).refused).toBe(true);
    expect((await refused(db, as(U.A), `select public.socia_rate_hit('user:x:transcribe', 3600, 1)`)).refused).toBe(true);
  });
});

/** The SECURITY DEFINER functions a signed-in session may call (checked below to use auth.uid()). */
const SESSION_FUNCTIONS = [
  "socia_consume_usage", // counts the caller's own AI usage
  "socia_invite_preview", // what an invite link is for, given the secret link
  "socia_is_ws_owner", // policy helper
  "socia_set_active_workspace", // switches the caller's own active brand
  "socia_ws_role", // policy helper
];
