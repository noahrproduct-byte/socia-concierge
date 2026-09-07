import { describe, expect, it } from "vitest";
import { buildGaps, goalKeywords } from "./gaps";
import type { IgMediaItem } from "./instagramSync";

const NOW = new Date("2026-09-07T20:00:00Z");
let seq = 0;
const post = (daysAgo: number, o: Partial<IgMediaItem> & { views?: number; reach?: number } = {}): IgMediaItem => ({
  id: `p${seq++}`, media_type: o.media_type ?? "VIDEO", caption: o.caption ?? "Fresh out of the oven",
  like_count: o.like_count ?? 100, comments_count: o.comments_count ?? 5,
  timestamp: new Date(NOW.getTime() - daysAgo * 86400000).toISOString(),
  insights: { views: o.views ?? 2000, reach: o.reach ?? 1500, saved: 3, shares: 2 },
});

describe("goal keywords", () => {
  it("keeps the concrete nouns of a goal", () => {
    expect(goalKeywords("Drive local orders, catering bookings and store visits across their multiple Tennessee locations")).toEqual(
      expect.arrayContaining(["local", "order", "catering", "booking", "store", "visit"]),
    );
  });
});

describe("what's missing", () => {
  it("finds nothing to say below five posts", () => {
    expect(buildGaps({ media: [post(1), post(2)], followers: 1000, goals: null, location: null, frequencyTarget: null, now: NOW })).toEqual([]);
  });
  it("flags a cadence drop against the account's own typical week", () => {
    // 3 posts/week for 8 weeks, then 1 post in the last 7 days.
    const media: IgMediaItem[] = [post(3)];
    for (let w = 1; w <= 8; w++) for (let k = 0; k < 3; k++) media.push(post(7 * w + 1 + k * 2));
    media.push(post(70));
    const g = buildGaps({ media, followers: 1000, goals: null, location: null, frequencyTarget: null, now: NOW });
    const f = g.find((x) => x.id === "frequency")!;
    expect(f).toBeDefined();
    expect(f.headline).toContain("1 post in the last 7 days");
    expect(f.observed[1]).toContain("Typical week: 3 posts");
  });
  it("flags a strongest format that is underused, from medians", () => {
    const media: IgMediaItem[] = [];
    for (let i = 0; i < 4; i++) media.push(post(30 + i * 3, { media_type: "CAROUSEL_ALBUM", views: 9000 }));
    for (let i = 0; i < 10; i++) media.push(post(1 + i * 2, { media_type: "VIDEO", views: 2000 }));
    const g = buildGaps({ media, followers: 1000, goals: null, location: null, frequencyTarget: null, now: NOW });
    const f = g.find((x) => x.id === "format")!;
    expect(f).toBeDefined();
    expect(f.title).toBe("Carousels");
    expect(f.performance).toContain("4.5×");
  });
  it("reports missing prompts and goal coverage with counts, and ranks deterministically", () => {
    const media: IgMediaItem[] = Array.from({ length: 12 }, (_, i) => post(1 + i * 3, { caption: i === 0 ? "Which slice wins?" : "Slice of the day" }));
    const g = buildGaps({ media, followers: 1000, goals: "Drive catering bookings", location: "Hermitage, TN", frequencyTarget: null, now: NOW });
    const ids = g.map((x) => x.id);
    expect(ids).toContain("prompts");
    expect(ids).toContain("goal");
    expect(ids).toContain("local");
    expect(g.find((x) => x.id === "prompts")!.headline).toContain("1 of your last 10");
    const again = buildGaps({ media, followers: 1000, goals: "Drive catering bookings", location: "Hermitage, TN", frequencyTarget: null, now: NOW });
    expect(again.map((x) => [x.id, x.score])).toEqual(g.map((x) => [x.id, x.score]));
    expect(g.length).toBeLessThanOrEqual(5);
  });
});
