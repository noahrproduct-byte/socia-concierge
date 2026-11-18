import { describe, it, expect, vi, beforeEach } from "vitest";

// The real adapters register Instagram, YouTube and the rest as a side effect.
// These tests register a counting stand-in instead, so nothing reaches a platform.
vi.mock("./adapters", () => ({}));

import { registerAdapter, type PublishContext, type PublishOutcome } from "./adapter";
import { claimPlan, publishDestination, CLAIM_LEASE_MS } from "./runner";
import { defaultSettings, type ContentItem, type Destination } from "./types";
import { claimPost, publishHeld, publishFailureIsFinal, PUBLISH_LEASE_MS, MAX_ATTEMPTS } from "../scheduling";

const NOW = new Date("2026-11-17T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

type Row = Record<string, unknown>;

/**
 * A one-table stand-in for supabase-js: updates apply their eq / neq / is
 * filters to the rows and return the matched ids when .select() is chained,
 * one write at a time, the way Postgres serialises two updates to one row.
 * Reads answer empty, which refreshParent tolerates.
 */
function fakeDb(table: string, rows: Row[]) {
  const empty = (): unknown => {
    const q: Record<string, unknown> = {};
    for (const k of ["select", "eq", "in", "is", "order", "limit", "neq"]) q[k] = () => q;
    q.maybeSingle = async () => ({ data: null, error: null });
    q.then = (res: (v: unknown) => void) => res({ data: [], error: null });
    return q;
  };
  return {
    rows,
    from(t: string) {
      return {
        select: () => empty(),
        update(patch: Row) {
          const tests: ((r: Row) => boolean)[] = [];
          let returning = false;
          const q = {
            eq: (c: string, v: unknown) => { tests.push((r) => r[c] === v); return q; },
            neq: (c: string, v: unknown) => { tests.push((r) => r[c] !== v); return q; },
            is: (c: string, v: unknown) => { tests.push((r) => (r[c] ?? null) === v); return q; },
            select: () => { returning = true; return q; },
            then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
              Promise.resolve()
                .then(() => {
                  const hit = t === table ? rows.filter((r) => tests.every((f) => f(r))) : [];
                  for (const r of hit) Object.assign(r, patch);
                  return { data: returning ? hit.map((r) => ({ id: r.id })) : null, error: null };
                })
                .then(res, rej),
          };
          return q;
        },
      };
    },
  };
}

const dest = (over: Partial<Destination> = {}): Destination => ({
  id: "d1", postId: "p1", platform: "instagram", accountId: "17841", status: "scheduled",
  scheduledAt: ago(60_000), startedAt: null, publishedAt: null, externalPostId: null, externalContainerId: null,
  permalink: null, errorCode: null, errorMessage: null, retryCount: 0, nextRetryAt: null,
  settings: defaultSettings("instagram"), createdAt: ago(3600_000), updatedAt: ago(3600_000), ...over,
});

const destRow = (d: Destination): Row => ({
  id: d.id, status: d.status, external_post_id: d.externalPostId, external_container_id: d.externalContainerId, updated_at: d.updatedAt,
});

const item = { id: "p1", caption: "hi", media: [{ url: "https://x/v.mp4" }], destinations: [] } as unknown as ContentItem;

let publishes = 0;
let polls = 0;
beforeEach(() => {
  publishes = 0;
  polls = 0;
  registerAdapter({
    platform: "instagram",
    async publish(): Promise<PublishOutcome> {
      publishes += 1;
      await new Promise((r) => setTimeout(r, 5));
      return { status: "processing", externalContainerId: `c${publishes}`, errorCode: null, errorMessage: null };
    },
    async poll(): Promise<PublishOutcome> {
      polls += 1;
      await new Promise((r) => setTimeout(r, 5));
      return { status: "processing", externalContainerId: "c1", errorCode: null, errorMessage: null };
    },
  });
});

const ctx = (supabase: unknown, d: Destination, interactive: boolean): PublishContext =>
  ({ supabase, userId: "u1", item, destination: d, budgetMs: 10_000, now: NOW, interactive }) as PublishContext;

describe("claimPlan", () => {
  it("claims a row that is not on the platform yet", () => {
    expect(claimPlan(dest(), NOW)).toBe("start");
    expect(claimPlan(dest({ status: "failed" }), NOW)).toBe("start");
  });
  it("leaves an in-flight row alone while another run may hold it, and resumes it after the lease", () => {
    expect(claimPlan(dest({ status: "processing", externalContainerId: "c1", updatedAt: ago(10_000) }), NOW)).toBe("busy");
    expect(claimPlan(dest({ status: "uploading", updatedAt: ago(CLAIM_LEASE_MS - 1) }), NOW)).toBe("busy");
    expect(claimPlan(dest({ status: "uploading", updatedAt: ago(CLAIM_LEASE_MS + 1) }), NOW)).toBe("resume");
  });
  it("guards nothing for a post already on the platform or a browser upload", () => {
    expect(claimPlan(dest({ externalPostId: "m1", status: "processing", updatedAt: ago(1_000) }), NOW)).toBe("none");
    expect(claimPlan(dest({ platform: "youtube" }), NOW)).toBe("none");
  });
});

describe("publishDestination never sends one destination twice", () => {
  it("two runs that read the same scheduled row: one publishes, the other backs off", async () => {
    const d = dest();
    const db = fakeDb("post_destinations", [destRow(d)]);
    const [a, b] = await Promise.all([
      publishDestination(ctx(db, { ...d }, false)), // the cron
      publishDestination(ctx(db, { ...d }, true)), // Publish now
    ]);
    expect(publishes).toBe(1);
    expect([a.busy, b.busy].filter(Boolean)).toHaveLength(1);
    expect(db.rows[0].status).toBe("processing");
    expect(db.rows[0].external_container_id).toBe("c1");
  });

  it("a row another run moved since it was read is not sent", async () => {
    const d = dest();
    const db = fakeDb("post_destinations", [{ ...destRow(d), status: "uploading" }]);
    const out = await publishDestination(ctx(db, d, true));
    expect(out.busy).toBe(true);
    expect(publishes).toBe(0);
    expect(db.rows[0].status).toBe("uploading");
  });

  it("an in-flight row touched within the lease is not polled", async () => {
    const d = dest({ status: "processing", externalContainerId: "c1", updatedAt: ago(5_000) });
    const db = fakeDb("post_destinations", [destRow(d)]);
    const out = await publishDestination(ctx(db, d, false));
    expect(out).toEqual({ status: "processing", busy: true });
    expect(polls).toBe(0);
  });

  it("an abandoned in-flight row is resumed by exactly one of two runs", async () => {
    const d = dest({ status: "processing", externalContainerId: "c1", updatedAt: ago(CLAIM_LEASE_MS * 2) });
    const db = fakeDb("post_destinations", [destRow(d)]);
    await Promise.all([publishDestination(ctx(db, { ...d }, false)), publishDestination(ctx(db, { ...d }, false))]);
    expect(polls).toBe(1);
    expect(publishes).toBe(0);
  });
});

describe("legacy Instagram posts", () => {
  const post = (over: Row = {}): Row => ({ id: "s1", status: "scheduled", attempts: 0, container_id: null, ...over });

  it("two runs racing for one post: only one makes a container", async () => {
    const db = fakeDb("scheduled_posts", [post()]);
    const from = { attempts: 0, status: "scheduled" };
    const [a, b] = await Promise.all([
      claimPost(db, "s1", from, { status: "publishing" }, { noContainer: true }),
      claimPost(db, "s1", from, { status: "publishing" }, { noContainer: true }),
    ]);
    expect([a, b].sort()).toEqual([false, true]);
    expect(db.rows[0]).toMatchObject({ status: "publishing", attempts: 1 });
  });

  it("a post that already has a container is not given a second one", async () => {
    const db = fakeDb("scheduled_posts", [post({ container_id: "c9" })]);
    expect(await claimPost(db, "s1", { attempts: 0, status: "scheduled" }, { status: "publishing" }, { noContainer: true })).toBe(false);
  });

  it("a publishing post is held while a run may be working on it", () => {
    expect(publishHeld({ status: "publishing", updated_at: ago(10_000) }, NOW)).toBe(true);
    expect(publishHeld({ status: "publishing", updated_at: ago(PUBLISH_LEASE_MS + 1) }, NOW)).toBe(false);
    expect(publishHeld({ status: "scheduled", updated_at: ago(1_000) }, NOW)).toBe(false);
  });

  it("publish failures end the post instead of retrying forever", () => {
    // One container try, then MAX_ATTEMPTS publish tries.
    expect(publishFailureIsFinal(MAX_ATTEMPTS)).toBe(false);
    expect(publishFailureIsFinal(MAX_ATTEMPTS + 1)).toBe(true);
  });
});
