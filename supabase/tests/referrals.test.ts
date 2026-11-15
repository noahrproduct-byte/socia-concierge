// Invite a friend (supabase/referrals.sql): a person's code, who invited whom,
// and what each person currently has from invitations. A signed-in person can
// read their own rows and write none of them; only SOCIA's server writes. The
// file runs twice without harm.

import { beforeAll, describe, expect, it } from "vitest";
import { freshDatabase, refused, rowsAs, type Db } from "./harness";
import { seed, U } from "./seed";

let db: Db;
const as = (uid: string) => ({ role: "authenticated", uid }) as const;
const anon = { role: "anon" } as const;

beforeAll(async () => {
  ({ db } = await freshDatabase({ before: { "security-hardening.sql": seed }, rerun: ["referrals.sql"] }));
  await db.exec(`
    insert into public.referral_codes (user_id, code) values ('${U.A}', 'aaaa2345'), ('${U.B}', 'bbbb2345');
    insert into public.referrals (referred_id, referrer_id, qualified_at) values ('${U.B}', '${U.A}', now());
    insert into public.referral_bonuses (user_id, active, until) values ('${U.A}', 1, now() + interval '30 days'), ('${U.B}', 1, now() + interval '30 days');
  `);
}, 180_000);

describe("reading invitations", () => {
  it("shows a person their own code and bonus, and nobody else's", async () => {
    expect(await rowsAs<{ code: string }>(db, as(U.A), `select code from public.referral_codes`)).toEqual([{ code: "aaaa2345" }]);
    expect((await rowsAs(db, as(U.A), `select user_id from public.referral_bonuses`)).length).toBe(1);
    expect(await rowsAs(db, as(U.O), `select code from public.referral_codes`)).toEqual([]);
    expect(await rowsAs(db, as(U.O), `select user_id from public.referral_bonuses`)).toEqual([]);
  });
  it("shows an invitation to the two people in it only", async () => {
    expect((await rowsAs(db, as(U.A), `select referred_id from public.referrals`)).length).toBe(1);
    expect((await rowsAs(db, as(U.B), `select referred_id from public.referrals`)).length).toBe(1);
    expect(await rowsAs(db, as(U.O), `select referred_id from public.referrals`)).toEqual([]);
  });
  it("shows nothing to someone who isn't signed in", async () => {
    for (const t of ["referral_codes", "referrals", "referral_bonuses"]) expect((await refused(db, anon, `select * from public.${t}`)).refused).toBe(true);
  });
});

describe("writing invitations", () => {
  it("can't be done from a signed-in browser: no bonus for yourself", async () => {
    expect((await refused(db, as(U.O), `insert into public.referral_bonuses (user_id, active, until) values ('${U.O}', 5, now() + interval '30 days')`)).refused).toBe(true);
    expect((await refused(db, as(U.A), `update public.referral_bonuses set active = 5 where user_id = '${U.A}'`)).refused).toBe(true);
    expect((await refused(db, as(U.A), `delete from public.referral_bonuses where user_id = '${U.A}'`)).refused).toBe(true);
  });
  it("can't be done from a signed-in browser: no invitation claimed or changed", async () => {
    expect((await refused(db, as(U.O), `insert into public.referrals (referred_id, referrer_id, qualified_at) values ('${U.O}', '${U.A}', now())`)).refused).toBe(true);
    expect((await refused(db, as(U.A), `update public.referrals set qualified_at = now() - interval '1 day' where referrer_id = '${U.A}'`)).refused).toBe(true);
    expect((await refused(db, as(U.O), `insert into public.referral_codes (user_id, code) values ('${U.O}', 'cccc2345')`)).refused).toBe(true);
    expect((await refused(db, as(U.A), `update public.referral_codes set code = 'zzzz2345' where user_id = '${U.A}'`)).refused).toBe(true);
  });
});

describe("the tables' own rules", () => {
  it("allow one inviter per person, never yourself, and at most five counting", async () => {
    await expect(db.query(`insert into public.referrals (referred_id, referrer_id) values ('${U.B}', '${U.O}')`)).rejects.toThrow();
    await expect(db.query(`insert into public.referrals (referred_id, referrer_id) values ('${U.O}', '${U.O}')`)).rejects.toThrow();
    await expect(db.query(`update public.referral_bonuses set active = 6 where user_id = '${U.A}'`)).rejects.toThrow();
    await expect(db.query(`insert into public.referral_codes (user_id, code) values ('${U.O}', 'Bad Code!')`)).rejects.toThrow();
  });
});
