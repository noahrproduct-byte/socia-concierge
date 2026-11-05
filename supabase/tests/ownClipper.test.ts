// SOCIA's own clipper's database (supabase/own-clipper.sql): clips keep their
// range in the source, crop and post; only the server writes them; and the
// uploads they are rendered from are kept 14 days, then cleaned up.

import { beforeAll, describe, expect, it } from "vitest";
import { asRequest, freshDatabase, refused, rowsAs, type Db } from "./harness";
import { seed, U } from "./seed";

let db: Db;
const as = (uid: string) => ({ role: "authenticated", uid }) as const;
const svc = { role: "service_role" } as const;

beforeAll(async () => {
  ({ db } = await freshDatabase({ before: { "security-hardening.sql": seed }, rerun: ["own-clipper.sql"] }));
}, 180_000);

describe("SOCIA's own clips", () => {
  it("stores a range, a crop and the job's words, and refuses a bad range or crop", async () => {
    const job = await asRequest(db, svc, async (tx) => (await tx.query<{ id: string }>(
      `insert into public.clip_jobs (user_id, source_kind, source_url, source_path, provider, stage, transcript, status)
       values ($1, 'upload', 'x', $2, 'socia', 'transcribing', '[["Hi", 0, 300]]'::jsonb, 'processing') returning id`, [U.A, `${U.A}/clipper-sources/a.mp4`])).rows[0].id, true);
    await asRequest(db, svc, (tx) => tx.query(`insert into public.clips (job_id, user_id, provider_clip_id, start_ms, end_ms, hook, crop_x) values ($1, $2, 'socia-1', 1000, 12000, 'So here is the thing', 0.2)`, [job, U.A]), true);
    const [c] = await rowsAs<{ start_ms: number; crop_x: string }>(db, as(U.A), `select start_ms, crop_x from public.clips where job_id = $1`, [job]);
    expect(c).toMatchObject({ start_ms: 1000 });
    expect(Number(c.crop_x)).toBe(0.2);
    expect((await refused(db, svc, `insert into public.clips (job_id, user_id, provider_clip_id, start_ms, end_ms) values ($1, $2, 'socia-2', 5000, 4000)`, [job, U.A])).refused).toBe(true);
    expect((await refused(db, svc, `insert into public.clips (job_id, user_id, provider_clip_id, crop_x) values ($1, $2, 'socia-3', 1.5)`, [job, U.A])).refused).toBe(true);
  });

  it("can't be re-cropped or pointed at another post from the browser", async () => {
    const r = await refused(db, as(U.A), `update public.clips set crop_x = 0.9, post_id = null`);
    expect(r.refused || r.rows === 0).toBe(true);
  });

  it("keeps an own-clipper source 14 days, then lets the cleanup take it", async () => {
    await db.exec(`
      insert into storage.objects (bucket_id, name, created_at) values
        ('ai-media', '${U.A}/clipper-sources/recent-socia.mp4', now() - interval '3 days'),
        ('ai-media', '${U.A}/clipper-sources/old-socia.mp4', now() - interval '20 days');
      insert into public.clip_jobs (user_id, source_kind, source_url, source_path, provider, status, created_at) values
        ('${U.A}', 'upload', 'x', '${U.A}/clipper-sources/recent-socia.mp4', 'socia', 'done', now() - interval '3 days'),
        ('${U.A}', 'upload', 'x', '${U.A}/clipper-sources/old-socia.mp4', 'socia', 'done', now() - interval '20 days');
    `);
    const names = (await rowsAs<Record<string, string>>(db, svc, `select * from public.socia_ai_media_stale_uploads()`)).map((r) => Object.values(r)[0]);
    expect(names).toContain(`${U.A}/clipper-sources/old-socia.mp4`);
    expect(names).not.toContain(`${U.A}/clipper-sources/recent-socia.mp4`);
  });
});
