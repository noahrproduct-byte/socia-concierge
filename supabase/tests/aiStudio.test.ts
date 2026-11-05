// The AI Clipper and AI Studio's database (supabase/ai-studio.sql): credits
// move only through the server's functions and each movement happens once,
// the ai-media bucket is capped by size and type, and the cleanup finds only
// day-old uploads no open job needs.

import { beforeAll, describe, expect, it } from "vitest";
import { asRequest, freshDatabase, refused, rowsAs, type Db } from "./harness";
import { seed, U } from "./seed";

let db: Db;
const as = (uid: string) => ({ role: "authenticated", uid }) as const;
const svc = { role: "service_role" } as const;
const call = async <T = number>(sql: string, params: unknown[]): Promise<T> =>
  asRequest(db, svc, async (tx) => Object.values((await tx.query<Record<string, T>>(sql, params)).rows[0])[0], true);

beforeAll(async () => {
  ({ db } = await freshDatabase({ before: { "security-hardening.sql": seed }, rerun: ["ai-studio.sql"] }));
}, 180_000);

describe("credits", () => {
  it("grants the monthly allowance once a month", async () => {
    expect(await call(`select public.socia_credit_grant($1, 100, '2026-11-01')`, [U.A])).toBe(100);
    expect(await call(`select public.socia_credit_grant($1, 100, '2026-11-01')`, [U.A])).toBe(100);
  });

  it("spends once a job, refuses when short, and refunds once", async () => {
    expect(await call(`select public.socia_credit_spend($1, 60, 'clip_job', 'job-1')`, [U.A])).toBe(40);
    expect(await call(`select public.socia_credit_spend($1, 60, 'clip_job', 'job-1')`, [U.A])).toBe(40);
    await expect(call(`select public.socia_credit_spend($1, 60, 'clip_job', 'job-2')`, [U.A])).rejects.toThrow(/insufficient_credits/);
    expect(await call(`select public.socia_credit_refund($1, 'clip_job', 'job-1')`, [U.A])).toBe(100);
    expect(await call(`select public.socia_credit_refund($1, 'clip_job', 'job-1')`, [U.A])).toBe(100);
  });

  it("adds a paid top-up once per payment", async () => {
    expect(await call(`select public.socia_credit_topup($1, 2000, 'cs_test_1')`, [U.A])).toBe(2100);
    expect(await call(`select public.socia_credit_topup($1, 2000, 'cs_test_1')`, [U.A])).toBe(2100);
  });

  it("can't be moved or rewritten from the browser, and each person sees only their own", async () => {
    expect((await refused(db, as(U.A), `select public.socia_credit_topup($1, 999999, 'free')`, [U.A])).refused).toBe(true);
    expect((await refused(db, as(U.A), `select public.socia_credit_grant($1, 999999, '2026-12-01')`, [U.A])).refused).toBe(true);
    expect((await refused(db, as(U.A), `insert into public.credit_ledger (user_id, kind, amount, balance_after) values ($1, 'adjust', 999999, 999999)`, [U.A])).refused).toBe(true);
    expect((await rowsAs(db, as(U.B), `select id from public.credit_ledger`)).length).toBe(0);
    expect((await rowsAs(db, as(U.A), `select id from public.credit_ledger`)).length).toBeGreaterThan(0);
  });
});

describe("ai-media storage", () => {
  it("is private and capped by size and type", async () => {
    const [b] = (await db.query<{ public: boolean; file_size_limit: string; allowed_mime_types: string[] }>(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'ai-media'`)).rows;
    expect(b.public).toBe(false);
    expect(Number(b.file_size_limit)).toBe(2000 * 1024 * 1024);
    expect(b.allowed_mime_types).toEqual(["video/mp4", "video/quicktime", "video/3gpp", "image/jpeg", "image/png", "image/webp"]);
  });

  it("finds only day-old uploads that no open job needs", async () => {
    const old = "now() - interval '2 days'";
    await db.exec(`
      insert into storage.objects (bucket_id, name, created_at) values
        ('ai-media', '${U.A}/clipper-sources/unused.mp4', ${old}),
        ('ai-media', '${U.A}/clipper-sources/in-use.mp4', ${old}),
        ('ai-media', '${U.A}/clipper-sources/finished.mp4', ${old}),
        ('ai-media', '${U.A}/studio-inputs/unused.png', ${old}),
        ('ai-media', '${U.A}/clipper-sources/fresh.mp4', now()),
        ('ai-media', '${U.A}/clips/result.mp4', ${old});
      insert into public.clip_jobs (user_id, source_kind, source_url, source_path, status) values
        ('${U.A}', 'upload', 'x', '${U.A}/clipper-sources/in-use.mp4', 'processing'),
        ('${U.A}', 'upload', 'x', '${U.A}/clipper-sources/finished.mp4', 'done');
    `);
    const names = (await rowsAs<{ socia_ai_media_stale_uploads: string }>(db, svc, `select * from public.socia_ai_media_stale_uploads()`)).map((r) => Object.values(r)[0]).sort();
    expect(names).toEqual([`${U.A}/clipper-sources/finished.mp4`, `${U.A}/clipper-sources/unused.mp4`, `${U.A}/studio-inputs/unused.png`]);
    expect((await refused(db, as(U.A), `select * from public.socia_ai_media_stale_uploads()`)).refused).toBe(true);
  });
});
