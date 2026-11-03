// SOCIA's video cuts are server only (supabase/studio-cut-meter.sql): the
// browser can't read a cut, relabel it as the person's own edit, or mark it
// counted, even on its owner's own session. Exported cuts are marked counted.

import { beforeAll, describe, expect, it } from "vitest";
import { freshDatabase, refused, rowsAs, type Db } from "./harness";
import { seed, U, W } from "./seed";

let db: Db;
const anon = { role: "anon" } as const;
const as = (uid: string) => ({ role: "authenticated", uid }) as const;
const svc = { role: "service_role" } as const;
const PROJECT = "cccccccc-5555-4000-8000-000000000005";
const EDL = `'{"segments":[{"clipId":"c1","in":0,"out":3}]}'::jsonb`;

beforeAll(async () => {
  // Rows from before the migration: an exported AI cut, an AI cut only opened, the person's own edit.
  const before = async (d: Db) => {
    await d.exec(`
      insert into public.studio_builds (id, project_id, user_id, workspace_id, opportunity_idx, edl, guide, render_path) values
        ('dddddddd-0000-4000-8000-000000000001', '${PROJECT}', '${U.O}', '${W.W2}', 0, ${EDL}, '[]'::jsonb, '${U.O}/studio/a.mp4'),
        ('dddddddd-0000-4000-8000-000000000002', '${PROJECT}', '${U.O}', '${W.W2}', 1, ${EDL}, '[]'::jsonb, null),
        ('dddddddd-0000-4000-8000-000000000003', '${PROJECT}', '${U.O}', '${W.W2}', -1, ${EDL}, '[]'::jsonb, '${U.O}/studio/b.mp4');
    `);
  };
  ({ db } = await freshDatabase({ before: { "security-hardening.sql": seed, "studio-cut-meter.sql": before }, rerun: ["studio-cut-meter.sql"] }));
}, 180_000);

describe("studio_builds", () => {
  it("can't be read from the browser, even by the owner", async () => {
    expect((await refused(db, as(U.O), `select edl from public.studio_builds`)).refused).toBe(true);
    expect((await refused(db, anon, `select edl from public.studio_builds`)).refused).toBe(true);
  });

  it("can't be relabelled, marked counted, added or removed from the browser", async () => {
    expect((await refused(db, as(U.O), `update public.studio_builds set opportunity_idx = -1 where opportunity_idx = 1`)).refused).toBe(true);
    expect((await refused(db, as(U.O), `update public.studio_builds set cut_counted_at = now()`)).refused).toBe(true);
    expect((await refused(db, as(U.O), `insert into public.studio_builds (project_id, user_id, opportunity_idx, edl, guide) values ($1, $2, -1, ${EDL}, '[]'::jsonb)`, [PROJECT, U.O])).refused).toBe(true);
    expect((await refused(db, as(U.O), `delete from public.studio_builds`)).refused).toBe(true);
  });

  it("marks cuts already exported as counted, and nothing else", async () => {
    const rows = await rowsAs<{ opportunity_idx: number; counted: boolean }>(db, svc, `select opportunity_idx, cut_counted_at is not null as counted from public.studio_builds order by opportunity_idx`);
    expect(rows).toEqual([
      { opportunity_idx: -1, counted: false },
      { opportunity_idx: 0, counted: true },
      { opportunity_idx: 1, counted: false },
    ]);
  });
});
