import { describe, it, expect } from "vitest";
import { attributePost, learningLine } from "./attribution";
import { defaultSettings, type ContentItem, type Destination } from "./types";
import type { IgMediaItem } from "../instagramSync";

// --- factories --------------------------------------------------------------

const dest = (over: Partial<Destination> = {}): Destination => ({
  id: "d1", postId: "p1", platform: "instagram", accountId: "17841", status: "published",
  scheduledAt: null, startedAt: null, publishedAt: "2026-09-20T00:00:00Z",
  externalPostId: "m_target", externalContainerId: null, permalink: null,
  errorCode: null, errorMessage: null, retryCount: 0, nextRetryAt: null,
  settings: defaultSettings("instagram"), createdAt: "2026-09-20T00:00:00Z", updatedAt: "2026-09-20T00:00:00Z",
  ...over,
});

const makeItem = (destinations: Destination[], over: Partial<ContentItem> = {}): ContentItem => ({
  id: "p1", userId: "u1", caption: "Hello", media: [], scheduledAt: null,
  status: "published", source: "composer", planId: null, planDay: null,
  publishedAt: "2026-09-20T00:00:00Z", createdAt: "2026-09-20T00:00:00Z", updatedAt: "2026-09-20T00:00:00Z",
  destinations, ...over,
});

const ig = (id: string, likes: number, comments: number, over: Partial<IgMediaItem> = {}): IgMediaItem => ({
  id, like_count: likes, comments_count: comments, timestamp: "2026-09-01T00:00:00Z", ...over,
});

/** Minimal PostgREST chain answering getActiveConnection's active-account query. */
type Chain = {
  select: () => Chain;
  eq: () => Chain;
  is: () => Chain;
  limit: () => Promise<{ data: { media: IgMediaItem[] }[]; error: null }>;
};
function fakeIg(media: IgMediaItem[]): { from: () => Chain } {
  const chain: Chain = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    limit: async () => ({ data: [{ media }], error: null }),
  };
  return { from: () => chain };
}

// A seven-post account: interactions 20,40,60,80,100,120 plus the target 240.
// median of the seven = 80, so the target reads as 3.0× the typical post.
const media7: IgMediaItem[] = [
  ig("m_target", 200, 40, { insights: { views: 5000 } }),
  ig("a", 15, 5), ig("b", 30, 10), ig("c", 50, 10), ig("d", 70, 10), ig("e", 90, 10), ig("f", 110, 10),
];

// --- tests ------------------------------------------------------------------

describe("attributePost — Instagram", () => {
  it("matches synced media and computes the multiplier against the account median", async () => {
    const perf = await attributePost(fakeIg(media7), "u1", makeItem([dest({ externalPostId: "m_target" })]));
    expect(perf).toHaveLength(1);
    expect(perf[0]).toMatchObject({
      destinationId: "d1", platform: "instagram", externalPostId: "m_target",
      found: true, interactions: 240, views: 5000, median: 80, multiplier: 3, sampleSize: 7,
    });

    const line = learningLine(perf);
    expect(line).toEqual({ text: "This post reached 3.0× your typical Instagram post (median of 7 posts).", multiplier: 3 });
    // SOCIA voice: deterministic, no em dashes or exclamation marks.
    expect(line!.text).not.toMatch(/[—!]/);
  });

  it("returns found:false with null post metrics when analytics have not caught up", async () => {
    const perf = await attributePost(fakeIg(media7), "u1", makeItem([dest({ externalPostId: "not_synced_yet" })]));
    expect(perf).toHaveLength(1);
    expect(perf[0]).toMatchObject({ found: false, interactions: null, views: null, multiplier: null });
    // The account baseline is known even before this specific post is attributed;
    // only the post's own metrics are unknown (null, never 0).
    expect(perf[0].median).toBe(80);
    expect(perf[0].sampleSize).toBe(7);
    expect(learningLine(perf)).toBeNull();
  });

  it("suppresses the learning line below a defensible sample (fewer than 5 posts)", async () => {
    const media3: IgMediaItem[] = [ig("m_small", 100, 20, { insights: { views: 900 } }), ig("a", 10, 10), ig("b", 30, 10)];
    const perf = await attributePost(fakeIg(media3), "u1", makeItem([dest({ externalPostId: "m_small" })]));
    expect(perf[0]).toMatchObject({ found: true, interactions: 120, median: 40, multiplier: 3, sampleSize: 3 });
    // The match is real, but 3 posts is too thin a median to make a claim.
    expect(learningLine(perf)).toBeNull();
  });

  it("only attributes PUBLISHED destinations that carry an external id", async () => {
    const perf = await attributePost(fakeIg(media7), "u1", makeItem([
      dest({ id: "pub", externalPostId: "m_target" }),
      dest({ id: "sched", status: "scheduled", externalPostId: "m_target" }),
      dest({ id: "noid", status: "published", externalPostId: null }),
    ]));
    expect(perf.map((p) => p.destinationId)).toEqual(["pub"]);
  });
});

describe("attributePost — YouTube / Facebook", () => {
  it("returns found:false without inventing stats, and never reads the database", async () => {
    let dbReads = 0;
    const noDb = { from: () => { dbReads++; throw new Error("must not read the database for non-Instagram destinations"); } };
    const perf = await attributePost(noDb, "u1", makeItem([
      dest({ id: "yt1", platform: "youtube", externalPostId: "vid123", settings: defaultSettings("youtube") }),
      dest({ id: "fb1", platform: "facebook", externalPostId: "fb123", settings: defaultSettings("facebook") }),
    ]));
    expect(perf).toHaveLength(2);
    expect(perf.map((p) => p.platform)).toEqual(["youtube", "facebook"]);
    for (const p of perf) {
      expect(p).toMatchObject({ found: false, interactions: null, views: null, median: null, multiplier: null, sampleSize: 0 });
    }
    expect(learningLine(perf)).toBeNull();
    // The YouTube/Facebook branches store no per-post history, so no connection is read.
    expect(dbReads).toBe(0);
  });
});
