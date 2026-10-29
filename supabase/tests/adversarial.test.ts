// Attacks a signed-in customer could try with their own session and the
// public anon key, straight against Supabase REST. Real policies, real
// grants, real triggers (harness.ts); every refusal here is the database's.

import { beforeAll, describe, expect, it } from "vitest";
import { asRequest, freshDatabase, refused, rowsAs, type Db } from "./harness";
import { P, seed, U, W } from "./seed";

let db: Db;
const anon = { role: "anon" } as const;
const as = (uid: string) => ({ role: "authenticated", uid }) as const;

// A connected assistant and its token, a billing record and usage, all A's.
async function extra(d: Db) {
  await d.exec(`
    insert into public.usage_counters (user_id, meter, period_start, used) values ('${U.A}', 'ask_socia', date_trunc('month', now())::date, 7);
    insert into public.billing_events (id, type, user_id) values ('evt_1', 'invoice.paid', '${U.A}');
    insert into public.oauth_clients (client_id, kind, client_name, redirect_uris) values ('cl_1', 'dcr', 'Claude', array['https://claude.ai/cb']);
    insert into public.ai_connections (id, user_id, client_id, client_name, scopes, workspace_ids) values ('cccccccc-9999-4000-8000-000000000009', '${U.A}', 'cl_1', 'Claude', array['read'], array['${W.WA}']::uuid[]);
    insert into public.oauth_tokens (connection_id, kind, token_hash, scopes, expires_at) values ('cccccccc-9999-4000-8000-000000000009', 'access', 'hash-of-A-token', array['read'], now() + interval '1 hour');
    insert into public.tracked_competitors (user_id, platform, handle, workspace_id, is_active) values ('${U.A}', 'instagram', 'rival', '${W.WA}', false);
    insert into public.workspace_members (workspace_id, user_id, role) values ('${W.W1}', '${U.N}', 'member');
  `);
}

beforeAll(async () => {
  ({ db } = await freshDatabase({ before: { "security-hardening.sql": async (d) => { await seed(d); await extra(d); } } }));
}, 180_000);

describe("guessing ids and changing ownership", () => {
  it("another customer's row id returns nothing, for read, change or delete", async () => {
    expect((await rowsAs(db, as(U.B), `select id from public.scheduled_posts where id = $1`, [P.A])).length).toBe(0);
    expect((await refused(db, as(U.B), `update public.scheduled_posts set caption = 'x' where id = $1`, [P.A])).rows).toBe(0);
    expect((await refused(db, as(U.B), `delete from public.scheduled_posts where id = $1`, [P.A])).rows).toBe(0);
    expect((await rowsAs(db, as(U.B), `select id from public.workspaces where id = $1`, [W.WA])).length).toBe(0);
  });

  it("a customer can't hand their rows to someone else or take someone's", async () => {
    expect((await refused(db, as(U.B), `update public.scheduled_posts set user_id = $1 where id = $2`, [U.A, P.B])).refused).toBe(true);
    expect((await refused(db, as(U.B), `update public.workspaces set owner_id = $1 where id = $2`, [U.A, W.WB])).refused).toBe(true);
    expect((await refused(db, as(U.B), `insert into public.workspaces (owner_id, name) values ($1, 'mine now')`, [U.A])).refused).toBe(true);
  });

  it("pointing the active workspace at someone else's brand gives nothing (the app only honours reachable ones)", async () => {
    expect((await refused(db, as(U.B), `update public.profiles set active_workspace_id = $1 where user_id = $2`, [W.WA, U.B])).refused).toBe(false);
    expect((await rowsAs(db, as(U.B), `select id from public.workspaces where id = $1`, [W.WA])).length).toBe(0);
  });
});

describe("a member removed from a workspace", () => {
  it("loses access the moment the owner removes them", async () => {
    expect((await rowsAs<{ id: string }>(db, as(U.N), `select id from public.workspaces`)).map((r) => r.id)).toContain(W.W1);
    expect((await rowsAs(db, as(U.N), `select id from public.alert_events`)).length).toBe(1);
    await asRequest(db, as(U.O), (tx) => tx.query(`delete from public.workspace_members where workspace_id = $1 and user_id = $2`, [W.W1, U.N]), true);
    expect((await rowsAs<{ id: string }>(db, as(U.N), `select id from public.workspaces`)).map((r) => r.id)).not.toContain(W.W1);
    expect((await rowsAs(db, as(U.N), `select id from public.alert_events`)).length).toBe(0);
    expect((await rowsAs(db, as(U.N), `select workspace_id from public.workspace_members where user_id = $1`, [U.N])).length).toBe(0);
  });

  it("can't put themselves back", async () => {
    expect((await refused(db, as(U.N), `insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')`, [W.W1, U.N])).refused).toBe(true);
  });
});

describe("billing, usage and limits", () => {
  it("usage counters can be read but never lowered, reset or forged", async () => {
    expect((await rowsAs<{ used: number }>(db, as(U.A), `select used from public.usage_counters`))[0].used).toBe(7);
    // No update or delete policy: the statements match no row (or are refused), and the count stays.
    for (const sql of [`update public.usage_counters set used = 0`, `delete from public.usage_counters`]) {
      const r = await refused(db, as(U.A), sql);
      expect(r.refused || r.rows === 0, sql).toBe(true);
    }
    expect((await db.query<{ used: number }>(`select used from public.usage_counters where user_id = $1`, [U.A])).rows[0].used).toBe(7);
    expect((await refused(db, as(U.A), `insert into public.usage_counters (user_id, meter, period_start, used) values ($1, 'x', now()::date, -100)`, [U.A])).refused).toBe(true);
    expect((await rowsAs(db, as(U.B), `select used from public.usage_counters`)).length).toBe(0);
  });

  it("the usage function only ever counts up, for the caller, and refuses at the limit", async () => {
    const r = await rowsAs<{ used_count: number; allowed: boolean }>(db, as(U.A), `select * from public.socia_consume_usage('ask_socia', date_trunc('month', now())::date, 7)`);
    expect(r[0]).toEqual({ used_count: 7, allowed: false });
    // A counting-up call for another period touches only the caller's own row.
    await asRequest(db, as(U.B), (tx) => tx.query(`select public.socia_consume_usage('ask_socia', date_trunc('month', now())::date, 100)`), true);
    expect((await db.query<{ used: number }>(`select used from public.usage_counters where user_id = $1 and meter = 'ask_socia'`, [U.A])).rows[0].used).toBe(7);
  });

  it("billing records are invisible to the browser", async () => {
    expect((await refused(db, as(U.A), `select * from public.billing_events`)).rows).toBe(0);
    expect((await refused(db, as(U.A), `insert into public.billing_events (id, type, user_id) values ('evt_fake', 'checkout.session.completed', $1)`, [U.A])).refused).toBe(true);
  });

  it("competitor limits can't be skipped by writing the table directly", async () => {
    expect((await refused(db, as(U.A), `insert into public.tracked_competitors (user_id, platform, handle, workspace_id) values ($1, 'instagram', 'extra', $2)`, [U.A, W.WA])).refused).toBe(true);
    const r = await refused(db, as(U.A), `update public.tracked_competitors set is_active = true where user_id = $1`, [U.A]);
    expect(r.refused || r.rows === 0).toBe(true);
    expect((await db.query<{ is_active: boolean }>(`select is_active from public.tracked_competitors where handle = 'rival'`)).rows[0].is_active).toBe(false);
  });

  it("the server-only functions refuse a browser session", async () => {
    const calls = [
      `select public.socia_create_workspace('${U.A}', 'x', 99)`,
      `select * from public.socia_add_competitor('${U.A}', '${W.WA}', 'instagram', 'x', 99)`,
      `select * from public.socia_consume_usage_for('${U.B}', 'ask_socia', now()::date, 1)`,
      `select public.socia_release_usage('${U.A}', 'ask_socia', date_trunc('month', now())::date)`,
      `select * from public.socia_accept_invite('invite-token-w1-secret', '${U.A}', 99)`,
      `select public.socia_seat_count('${U.O}')`,
      `select public.socia_apply_plan_keep('${U.B}', array[]::text[], array[]::text[], 0, 0)`,
      `select public.socia_ai_cleanup()`,
    ];
    const ran: string[] = [];
    for (const sql of calls) {
      for (const who of [anon, as(U.A)]) if (!(await refused(db, who, sql)).refused) ran.push(`${who.role}: ${sql.slice(0, 50)}`);
    }
    expect(ran).toEqual([]);
  });
});

describe("assistant (MCP) access", () => {
  it("connections, tokens, codes and the audit log are server-only", async () => {
    for (const t of ["ai_connections", "oauth_tokens", "oauth_codes", "oauth_clients", "oauth_requests", "ai_audit_log", "api_rate_counters"]) {
      expect((await refused(db, as(U.A), `select * from public.${t}`)).rows, t).toBe(0);
      expect((await refused(db, anon, `select * from public.${t}`)).rows, t).toBe(0);
    }
    expect((await refused(db, as(U.A), `update public.oauth_tokens set expires_at = now() + interval '10 years'`)).rows).toBe(0);
  });
});

describe("private storage", () => {
  it("Studio uploads can't be read, listed, replaced or deleted by anyone else", async () => {
    const other = `${U.O}/proj/clip/source.mp4`;
    expect((await refused(db, as(U.B), `select name from storage.objects where bucket_id = 'studio-sources'`)).rows).toBe(0);
    expect((await refused(db, anon, `select name from storage.objects where bucket_id = 'studio-sources'`)).rows).toBe(0);
    expect((await refused(db, as(U.B), `update storage.objects set owner = $1 where name = $2`, [U.B, other])).rows).toBe(0);
    expect((await refused(db, as(U.B), `delete from storage.objects where name = $1`, [other])).rows).toBe(0);
    expect((await refused(db, as(U.B), `insert into storage.objects (bucket_id, name, owner) values ('studio-sources', $1, $2)`, [`${U.O}/proj/clip/evil.mp4`, U.B])).refused).toBe(true);
    // Control: the owner reaches their own upload.
    expect((await rowsAs(db, as(U.O), `select name from storage.objects where bucket_id = 'studio-sources'`)).length).toBe(1);
  });

  it("an Admin or Member's own session can't reach the owner's files (the server serves them by role)", async () => {
    for (const who of [U.AD, U.M]) expect((await rowsAs(db, as(who), `select name from storage.objects`)).length).toBe(0);
  });
});
