import { describe, it, expect } from "vitest";
import {
  backoffMinutes, planFailure, needsPoll, isDueDestination, sweepDecision, applyOutcome, withoutBrowser, persistPatch,
  MAX_RETRIES, MISSED_MESSAGE, GRACE_HOURS, UPLOAD_STALE_HOURS, NEEDS_BROWSER_MESSAGE,
} from "./runner";
import {
  rowToItem, destinationPatchToRow, isMissingTableError, parentsWithDestinations, updateDestination,
  type ParentRow, type DestinationRow,
} from "./db";
import { defaultSettings, type Destination } from "./types";

const NOW = new Date("2026-09-21T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const HOUR = 3600_000;

const dest = (over: Partial<Destination> = {}): Destination => ({
  id: "d1", postId: "p1", platform: "instagram", accountId: "17841", status: "scheduled",
  scheduledAt: ago(60_000), startedAt: null, publishedAt: null, externalPostId: null, externalContainerId: null,
  permalink: null, errorCode: null, errorMessage: null, retryCount: 0, nextRetryAt: null,
  settings: defaultSettings("instagram"), createdAt: ago(HOUR), updatedAt: ago(HOUR), ...over,
});

describe("retry schedule", () => {
  it("backs off 5, 15, 60 minutes and never beyond", () => {
    expect(backoffMinutes(1)).toBe(5);
    expect(backoffMinutes(2)).toBe(15);
    expect(backoffMinutes(3)).toBe(60);
    expect(backoffMinutes(9)).toBe(60);
  });
  it("a retryable failure waits for its retry; the fourth failure is final", () => {
    const first = planFailure(dest({ retryCount: 0 }), true, NOW);
    expect(first).toEqual({ status: "scheduled", retryCount: 1, nextRetryAt: new Date(NOW.getTime() + 5 * 60_000).toISOString() });
    const third = planFailure(dest({ retryCount: 2 }), true, NOW);
    expect(third.status).toBe("scheduled");
    expect(third.nextRetryAt).toBe(new Date(NOW.getTime() + 60 * 60_000).toISOString());
    const fourth = planFailure(dest({ retryCount: MAX_RETRIES }), true, NOW);
    expect(fourth).toEqual({ status: "failed", retryCount: 4, nextRetryAt: null });
  });
  it("a non-retryable failure is final immediately", () => {
    expect(planFailure(dest({ retryCount: 0 }), false, NOW)).toEqual({ status: "failed", retryCount: 1, nextRetryAt: null });
  });
});

describe("which rows are due", () => {
  it("scheduled and past its time is due; future is not", () => {
    expect(isDueDestination(dest(), NOW)).toBe(true);
    expect(isDueDestination(dest({ scheduledAt: new Date(NOW.getTime() + 60_000).toISOString() }), NOW)).toBe(false);
    expect(isDueDestination(dest({ scheduledAt: null }), NOW)).toBe(false);
  });
  it("in-flight rows are always looked at; a pending retry waits", () => {
    expect(isDueDestination(dest({ status: "uploading", scheduledAt: null }), NOW)).toBe(true);
    expect(isDueDestination(dest({ status: "processing" }), NOW)).toBe(true);
    expect(isDueDestination(dest({ nextRetryAt: new Date(NOW.getTime() + 60_000).toISOString() }), NOW)).toBe(false);
    expect(isDueDestination(dest({ nextRetryAt: ago(1) }), NOW)).toBe(true);
  });
  it("drafts, published and failed rows are not due", () => {
    for (const status of ["draft", "ready", "published", "failed", "cancelled"] as const) {
      expect(isDueDestination(dest({ status }), NOW)).toBe(false);
    }
  });
  it("polls when the platform already holds the job, publishes otherwise", () => {
    expect(needsPoll(dest())).toBe(false);
    expect(needsPoll(dest({ status: "processing" }))).toBe(true);
    expect(needsPoll(dest({ status: "uploading" }))).toBe(true);
    expect(needsPoll(dest({ platform: "youtube", status: "scheduled", externalPostId: "abc" }))).toBe(true);
  });
  it("never publishes a row that already holds an external id, whatever its status", () => {
    expect(needsPoll(dest({ status: "failed", externalPostId: "abc" }))).toBe(true);
    expect(needsPoll(dest({ status: "draft", externalPostId: "abc" }))).toBe(true);
  });
});

describe("browser work without a browser", () => {
  const action = { kind: "youtube_resumable_upload" as const, sessionUri: "https://u", accessToken: "t", mediaId: "m1", videoId: null };
  it("the cron records a failed, non-retryable row a person can retry instead of an upload nobody starts", () => {
    const out = withoutBrowser({ status: "uploading", clientAction: action }, false);
    expect(out).toEqual({ status: "failed", errorCode: "needs_browser", errorMessage: NEEDS_BROWSER_MESSAGE, retryable: false });
    expect(out.clientAction).toBeUndefined();
    expect(NEEDS_BROWSER_MESSAGE).not.toMatch(/[!—]/);
  });
  it("an interactive request keeps the client action; outcomes without one pass through", () => {
    expect(withoutBrowser({ status: "uploading", clientAction: action }, true).clientAction).toBe(action);
    expect(withoutBrowser({ status: "processing" }, false)).toEqual({ status: "processing" });
  });
});

describe("sweep decisions", () => {
  it("demotes a scheduled row whose owner lost the scheduling feature, never a row the platform already holds", () => {
    expect(sweepDecision(dest(), NOW, false)).toBe("demote");
    expect(sweepDecision(dest({ platform: "youtube", externalPostId: "abc" }), NOW, false)).toBe("run");
    expect(sweepDecision(dest({ status: "processing" }), NOW, false)).toBe("run");
  });
  it("marks a scheduled row missed past the grace window", () => {
    expect(sweepDecision(dest({ scheduledAt: ago(GRACE_HOURS * HOUR + 1) }), NOW, true)).toBe("missed");
    expect(sweepDecision(dest({ scheduledAt: ago(GRACE_HOURS * HOUR - 60_000) }), NOW, true)).toBe("run");
    expect(MISSED_MESSAGE).not.toMatch(/[!—]/);
  });
  it("a retry re-entering scheduled follows the backoff, never the grace sweep", () => {
    const old = ago(GRACE_HOURS * HOUR + 1);
    expect(sweepDecision(dest({ scheduledAt: old, retryCount: 1, nextRetryAt: ago(1) }), NOW, true)).toBe("run");
    expect(sweepDecision(dest({ scheduledAt: old, retryCount: 2, nextRetryAt: null }), NOW, true)).toBe("run");
    expect(sweepDecision(dest({ scheduledAt: old, retryCount: 0, nextRetryAt: ago(1) }), NOW, true)).toBe("run");
    expect(sweepDecision(dest({ scheduledAt: old, retryCount: 0, nextRetryAt: null }), NOW, true)).toBe("missed");
  });
  it("abandons an upload with no external id after 24 hours", () => {
    expect(sweepDecision(dest({ status: "uploading", startedAt: ago(UPLOAD_STALE_HOURS * HOUR + 1) }), NOW, true)).toBe("stale_upload");
    expect(sweepDecision(dest({ status: "uploading", startedAt: ago(HOUR) }), NOW, true)).toBe("run");
    expect(sweepDecision(dest({ status: "uploading", startedAt: ago(48 * HOUR), externalPostId: "vid" }), NOW, true)).toBe("run");
  });
});

describe("outcome to row patch", () => {
  it("published: sets published_at, clears errors, keeps ids", () => {
    const p = applyOutcome(dest({ externalContainerId: "c1", errorMessage: "old" }), { status: "published", externalPostId: "m1", permalink: "https://instagram.com/p/x" }, NOW);
    expect(p.status).toBe("published");
    expect(p.publishedAt).toBe(NOW.toISOString());
    expect(p.externalPostId).toBe("m1");
    expect(p.externalContainerId).toBe("c1");
    expect(p.errorCode).toBeNull();
    expect(p.errorMessage).toBeNull();
    expect(p.startedAt).toBe(NOW.toISOString());
  });
  it("published with a note keeps the note (thumbnail or privacy caveat)", () => {
    const note = "YouTube kept its own thumbnail (custom thumbnails are not enabled for this channel).";
    const p = applyOutcome(dest({ platform: "youtube" }), { status: "published", externalPostId: "v1", errorMessage: note }, NOW);
    expect(p.status).toBe("published");
    expect(p.errorMessage).toBe(note);
    expect(p.errorCode).toBeNull();
  });
  it("a publishing patch never writes null over an existing external id or permalink", () => {
    const p = persistPatch(dest({ externalPostId: "v1", permalink: "https://youtu.be/v1" }), { status: "published", externalPostId: null, permalink: null }, NOW);
    expect(p.status).toBe("published");
    expect("externalPostId" in p).toBe(false);
    expect("permalink" in p).toBe(false);
    const q = persistPatch(dest(), { status: "published", externalPostId: "m2", permalink: "https://x/m2" }, NOW);
    expect(q.externalPostId).toBe("m2");
    expect(q.permalink).toBe("https://x/m2");
    const f = persistPatch(dest({ externalPostId: "v1" }), { status: "failed", externalPostId: null, retryable: false }, NOW);
    expect(f.externalPostId).toBeNull();
  });
  it("retryable failure: back to scheduled with the platform's reason and a retry time", () => {
    const p = applyOutcome(dest(), { status: "failed", errorCode: "4", errorMessage: "Application request limit reached", retryable: true }, NOW);
    expect(p.status).toBe("scheduled");
    expect(p.retryCount).toBe(1);
    expect(p.nextRetryAt).toBe(new Date(NOW.getTime() + 5 * 60_000).toISOString());
    expect(p.errorMessage).toBe("Application request limit reached");
    expect(p.errorCode).toBe("4");
  });
  it("non-retryable failure: failed now", () => {
    const p = applyOutcome(dest(), { status: "failed", errorCode: "unavailable", errorMessage: "TikTok is not connected to SOCIA yet.", retryable: false }, NOW);
    expect(p.status).toBe("failed");
    expect(p.nextRetryAt).toBeNull();
  });
  it("in flight: keeps started_at from the first attempt and clears a stale error", () => {
    const started = ago(10 * 60_000);
    const p = applyOutcome(dest({ status: "processing", startedAt: started, errorMessage: "old" }), { status: "processing", externalContainerId: "c9" }, NOW);
    expect(p.startedAt).toBe(started);
    expect(p.errorMessage).toBeNull();
    expect(p.externalContainerId).toBe("c9");
  });
  it("maps model keys to columns and only the keys given", () => {
    expect(destinationPatchToRow({ status: "failed", errorMessage: "x", nextRetryAt: null })).toEqual({ status: "failed", error_message: "x", next_retry_at: null });
  });
});

describe("row mapping", () => {
  const parent: ParentRow = {
    id: "p1", user_id: "u1", ig_user_id: "17841", plan_id: null, plan_day: null, scheduled_at: "2026-09-22T10:00:00Z",
    caption: "Hello", media_type: "REELS", media_path: "u1/p1/a.mp4", media_url: "https://x/a.mp4", status: "scheduled",
    created_at: "2026-09-20T00:00:00Z", updated_at: "2026-09-20T00:00:00Z",
  };
  it("a legacy row becomes one item with one unmeasured, untyped video and no destinations", () => {
    const item = rowToItem(parent, []);
    expect(item.destinations).toEqual([]);
    expect(item.media).toHaveLength(1);
    expect(item.media[0]).toMatchObject({ kind: "video", mime: "", size: null, width: null, height: null, duration: null, path: "u1/p1/a.mp4" });
    expect(item.status).toBe("scheduled");
    expect(item.source).toBeNull();
  });
  it("stored media json without a positive size or a type reads as unknown, never 0 or a guess", () => {
    const media = [
      { id: "m1", kind: "video", name: "a.mp4", size: 0, width: 0, path: "u1/p1/a.mp4", url: "https://x/a.mp4" },
      { id: "m2", kind: "video", name: "b.mp4", mime: "video/quicktime", size: 5000, width: 1080, height: 1920, duration: 12.5, path: "u1/p1/b.mp4", url: "https://x/b.mp4" },
    ];
    const item = rowToItem({ ...parent, media }, []);
    expect(item.media[0]).toMatchObject({ mime: "", size: null, width: null, height: null, duration: null });
    expect(item.media[1]).toMatchObject({ mime: "video/quicktime", size: 5000, width: 1080, height: 1920, duration: 12.5 });
  });
  it("a composer row uses the stored media list and fills default settings under stored ones", () => {
    const media = [{ id: "m1", kind: "image", name: "a.jpg", mime: "image/jpeg", size: 1000, width: 1080, height: 1350, duration: null, path: "u1/p1/a.jpg", url: "https://x/a.jpg" }];
    const d: DestinationRow = {
      id: "d1", post_id: "p1", user_id: "u1", platform: "youtube", account_id: "UC1", status: "scheduled", scheduled_at: null, started_at: null,
      published_at: null, external_post_id: null, external_container_id: null, permalink: null, error_code: null, error_message: null,
      retry_count: null, next_retry_at: null, settings: { title: "T", madeForKids: false }, created_at: "2026-09-20T00:00:00Z", updated_at: "2026-09-20T00:00:00Z",
    };
    const item = rowToItem({ ...parent, media, source: "composer" }, [d]);
    expect(item.media[0].width).toBe(1080);
    expect(item.source).toBe("composer");
    expect(item.destinations[0].retryCount).toBe(0);
    expect(item.destinations[0].settings).toMatchObject({ title: "T", madeForKids: false, privacy: "public", tags: [] });
  });
  it("recognises a missing table in every shape PostgREST uses", () => {
    expect(isMissingTableError({ code: "42P01", message: "relation \"public.post_destinations\" does not exist" })).toBe(true);
    expect(isMissingTableError({ code: "PGRST205", message: "Could not find the table 'public.post_destinations' in the schema cache" })).toBe(true);
    expect(isMissingTableError({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(isMissingTableError(null)).toBe(false);
  });
});

/** A minimal PostgREST-shaped client whose post_destinations select answers as told. */
function fakeSelect(answer: { data?: unknown; error?: unknown } | Error) {
  return {
    from: () => ({
      select: () => ({
        in: async () => { if (answer instanceof Error) throw answer; return answer; },
      }),
    }),
  };
}

describe("parentsWithDestinations is tri-state", () => {
  it("a Set of the parents that have rows on success", async () => {
    const r = await parentsWithDestinations(fakeSelect({ data: [{ post_id: "p1" }, { post_id: "p1" }, { post_id: "p3" }], error: null }), ["p1", "p2", "p3"]);
    expect(r).toEqual(new Set(["p1", "p3"]));
  });
  it("an empty Set only when the table is missing (pre-migration: nothing has destinations)", async () => {
    expect(await parentsWithDestinations(fakeSelect({ data: null, error: { code: "42P01", message: "relation does not exist" } }), ["p1"])).toEqual(new Set());
    expect(await parentsWithDestinations(fakeSelect({ data: null, error: { code: "PGRST205", message: "Could not find the table in the schema cache" } }), ["p1"])).toEqual(new Set());
  });
  it("null for any other failure, so a caller never mistakes unreadable for none", async () => {
    expect(await parentsWithDestinations(fakeSelect({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }), ["p1"])).toBeNull();
    expect(await parentsWithDestinations(fakeSelect(new Error("fetch failed")), ["p1"])).toBeNull();
  });
  it("no ids means no parents, without a query", async () => {
    expect(await parentsWithDestinations(fakeSelect(new Error("must not be called")), [])).toEqual(new Set());
  });
});

describe("updateDestination unlessPublished", () => {
  /** Records the filters a chained update applies. */
  function fakeUpdate() {
    const calls: { row: Record<string, unknown>; filters: string[] }[] = [];
    const chain = (row: Record<string, unknown>) => {
      const entry = { row, filters: [] as string[] };
      calls.push(entry);
      const q = {
        eq: (c: string, v: string) => { entry.filters.push(`eq ${c} ${v}`); return q; },
        neq: (c: string, v: string) => { entry.filters.push(`neq ${c} ${v}`); return q; },
        then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
      };
      return q;
    };
    return { calls, client: { from: () => ({ update: chain }) } };
  }
  it("skips a row that meanwhile became published unless the patch publishes it", async () => {
    const f = fakeUpdate();
    await updateDestination(f.client, "d1", { status: "failed", errorMessage: "x" }, { unlessPublished: true });
    expect(f.calls[0].filters).toEqual(["eq id d1", "neq status published"]);
    await updateDestination(f.client, "d1", { status: "published", externalPostId: "v1" }, { unlessPublished: true });
    expect(f.calls[1].filters).toEqual(["eq id d1"]);
    await updateDestination(f.client, "d1", { status: "draft" });
    expect(f.calls[2].filters).toEqual(["eq id d1"]);
  });
});
