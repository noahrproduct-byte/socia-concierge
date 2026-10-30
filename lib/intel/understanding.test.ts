import { describe, it, expect } from "vitest";
import { buildAccountSample, sampleIsEnough } from "./accountSample";
import { normalizeUnderstanding, confidenceLabel } from "./understanding";
import type { IgMediaItem } from "../instagramSync";

const NOW = new Date("2026-10-29T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const ig = (i: number, over: Partial<IgMediaItem> = {}): IgMediaItem => ({
  id: `m${i}`, caption: `Fresh dough every morning at Salvo's, slice ${i}`, media_type: "VIDEO", media_product_type: "REELS",
  like_count: 10, comments_count: 0, timestamp: day(i * 3), ...over,
});

describe("buildAccountSample", () => {
  it("computes facts without AI: cadence, formats and standout posts against the account's own median", () => {
    const media = [ig(0, { like_count: 100 }), ig(1), ig(2), ig(3), ig(4), ig(5, { media_type: "IMAGE", media_product_type: "FEED" })];
    const s = buildAccountSample({ now: NOW, ig: { username: "salvos", name: "Salvo's", biography: "Pizza in Hermitage, TN", followers: 1200, media }, fb: null, yt: null, tt: null });
    const f = s.facts[0];
    expect(f.platform).toBe("instagram");
    expect(f.postsSampled).toBe(6);
    expect(f.postsLast30).toBe(6);
    expect(f.postsPerWeek).toBe(1.4);
    expect(f.formats).toEqual([{ format: "Reel", count: 5 }, { format: "Photo", count: 1 }]);
    expect(f.standouts).toHaveLength(1);
    expect(f.standouts[0]).toMatchObject({ multiple: 10, metric: "interactions", value: 100 });
    expect(sampleIsEnough(s)).toBe(true);
  });

  it("names no standouts below five measured posts, and leaves out collab posts", () => {
    const s = buildAccountSample({ now: NOW, ig: { username: "a", name: null, biography: null, followers: null, media: [ig(0, { like_count: 500 }), ig(1), ig(2, { collab_owner: "other" })] }, fb: null, yt: null, tt: null });
    expect(s.facts[0].postsSampled).toBe(2);
    expect(s.facts[0].standouts).toEqual([]);
  });

  it("reads YouTube titles and marks short videos as Shorts", () => {
    const s = buildAccountSample({ now: NOW, ig: null, fb: null, tt: null, yt: { title: "Salvo's Pizza", handle: "@salvospizza3966", subscribers: 359, videos: [{ videoId: "v1", title: "Double Crust Pizza", publishedAt: day(2), thumb: null, views: 49800, likes: 308, comments: 5, durationSec: 30 }] } });
    expect(s.posts[0]).toMatchObject({ platform: "youtube", format: "Short", text: "Double Crust Pizza", metric: { name: "views", value: 49800 } });
  });
});

describe("normalizeUnderstanding", () => {
  it("keeps allowed values with their confidence and evidence", () => {
    const u = normalizeUnderstanding({
      account_type: { value: "business", confidence: 92, evidence: ["Bio: Pizza in Hermitage, TN"] },
      niche: { category: "Food & Restaurant", subcategory: "Pizza", specific: "", confidence: 88, evidence: ["Fresh dough every morning"] },
      audience: { value: "Local families", confidence: 50, evidence: [] },
      geography: { place: "Hermitage, TN", scope: "local", confidence: 80, evidence: ["bio"] },
      personality: { value: ["warm", "playful"], confidence: 60, evidence: [] },
      themes: [{ name: "Dough prep", posts: 5, example: "Fresh dough" }, { name: "One-off", posts: 1, example: "x" }],
      suggested_goal: { goal: "bookings_orders", reason: "Bio has an order link" },
      limitations: ["Instagram only"],
    }, [], NOW);
    expect(u.account_type).toEqual({ value: "business", confidence: 92, evidence: ["Bio: Pizza in Hermitage, TN"] });
    expect(u.niche?.value).toEqual({ category: "Food & Restaurant", subcategory: "Pizza", specific: null });
    expect(u.themes.map((t) => t.name)).toEqual(["Dough prep"]);
    expect(u.suggested_goal).toEqual({ goal: "bookings_orders", reason: "Bio has an order link" });
  });

  it("turns unknown values into nothing, never a guess", () => {
    const u = normalizeUnderstanding({ account_type: { value: "spaceship", confidence: 99 }, niche: { category: "Not a niche" }, suggested_goal: { goal: "none", reason: "" }, geography: { scope: "moon" } }, [], NOW);
    expect(u.account_type).toBeNull();
    expect(u.niche).toBeNull();
    expect(u.geography).toBeNull();
    expect(u.suggested_goal).toBeNull();
    expect(normalizeUnderstanding(null, [], NOW).themes).toEqual([]);
  });

  it("labels confidence plainly", () => {
    expect(confidenceLabel(90)).toBe("Clear from your posts");
    expect(confidenceLabel(60)).toBe("Likely");
    expect(confidenceLabel(20)).toBe("A guess, please check");
  });
});
