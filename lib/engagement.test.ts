import { describe, expect, it } from "vitest";
import { interactionsOf, engagementRateOf, engagementBreakdown, engagementQuality } from "./engagement";
import type { IgMediaItem } from "./instagramSync";

const post = (o: Partial<IgMediaItem> & { reach?: number; saved?: number; shares?: number }): IgMediaItem => ({
  id: String(Math.random()), like_count: o.like_count ?? 0, comments_count: o.comments_count ?? 0, timestamp: o.timestamp, media_type: o.media_type ?? "VIDEO",
  insights: o.reach != null || o.saved != null || o.shares != null ? { reach: o.reach, saved: o.saved, shares: o.shares } : undefined,
});

describe("interactions", () => {
  it("adds saves and shares only when Instagram returned them", () => {
    expect(interactionsOf(post({ like_count: 10, comments_count: 2 })).total).toBe(12);
    expect(interactionsOf(post({ like_count: 10, comments_count: 2, saved: 3, shares: 1 })).total).toBe(16);
    expect(interactionsOf(post({ like_count: 10, comments_count: 2 })).saves).toBeNull();
  });
});

describe("engagement rate", () => {
  it("uses reach when every post has it, and says so", () => {
    const r = engagementRateOf([post({ like_count: 50, reach: 1000 }), post({ like_count: 30, comments_count: 20, reach: 1000 })], 5000);
    expect(r.method).toBe("reach");
    expect(r.value).toBeCloseTo(5);
    expect(r.suffix).toBe("of reached accounts");
  });
  it("falls back to followers and labels it when reach is missing", () => {
    const r = engagementRateOf([post({ like_count: 50 }), post({ like_count: 50, reach: 1000 })], 5000);
    expect(r.method).toBe("followers");
    expect(r.value).toBeCloseTo(1);
  });
  it("returns null rather than zero without a denominator", () => {
    expect(engagementRateOf([post({ like_count: 5 })], null).value).toBeNull();
    expect(engagementRateOf([], 100).value).toBeNull();
  });
});

describe("breakdown", () => {
  it("keeps saves as not-available when no post reported them", () => {
    const b = engagementBreakdown([post({ like_count: 8, comments_count: 2 })]);
    expect(b.total).toBe(10);
    expect(b.parts.find((p) => p.id === "saves")!.value).toBeNull();
    expect(b.parts.find((p) => p.id === "likes")!.share).toBeCloseTo(0.8);
  });
});

describe("quality", () => {
  it("says nothing below four posts per side", () => {
    const ps = [1, 2, 3, 4, 5].map((i) => post({ like_count: i, timestamp: `2026-08-0${i}T10:00:00Z` }));
    expect(engagementQuality(ps, () => "Reel")).toEqual([]);
  });
  it("reports a comments change from medians", () => {
    const ps = Array.from({ length: 10 }, (_, i) => post({ comments_count: i < 5 ? 10 : 2, saved: 1, shares: 1, timestamp: `2026-08-${String(20 - i).padStart(2, "0")}T10:00:00Z` }));
    const q = engagementQuality(ps, () => "Reel");
    const c = q.find((n) => n.id === "comments")!;
    expect(c.tone).toBe("up");
    expect(c.detail).toContain("+400%");
  });
});
