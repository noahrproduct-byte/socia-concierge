import { describe, expect, it } from "vitest";
import {
  engagementOf,
  median,
  outlierMultiplier,
  pctChange,
  postsPerWeek,
  trendDirection,
  engagementRate,
  fmtMult,
} from "./metrics";

describe("median", () => {
  it("handles odd samples", () => {
    expect(median([42, 48, 51, 55, 62])).toBe(51);
  });
  it("handles even samples", () => {
    expect(median([100, 200, 300, 400])).toBe(250);
  });
  it("is order-independent and non-mutating", () => {
    const xs = [5, 1, 3];
    expect(median(xs)).toBe(3);
    expect(xs).toEqual([5, 1, 3]);
  });
  it("returns null for empty samples", () => {
    expect(median([])).toBeNull();
  });
});

describe("outlierMultiplier", () => {
  it("computes the spec example: 410K vs 100K median = 4.1", () => {
    expect(outlierMultiplier(410000, 100000)).toBeCloseTo(4.1);
  });
  it("keeps full precision (rounding is presentation-only)", () => {
    expect(outlierMultiplier(410000, 53000)).toBeCloseTo(7.7358, 3);
    expect(fmtMult(410000 / 53000)).toBe("7.7×");
  });
  it("never divides by zero", () => {
    expect(outlierMultiplier(100, 0)).toBeNull();
    expect(outlierMultiplier(100, null)).toBeNull();
  });
});

describe("pctChange", () => {
  it("computes growth", () => {
    expect(pctChange(106, 100)).toBeCloseTo(6);
  });
  it("computes decline", () => {
    expect(pctChange(80, 100)).toBeCloseTo(-20);
  });
  it("returns null without a valid previous value", () => {
    expect(pctChange(10, 0)).toBeNull();
    expect(pctChange(10, null)).toBeNull();
  });
});

describe("postsPerWeek", () => {
  const now = new Date("2026-08-23T00:00:00Z").getTime();
  const daysAgo = (d: number) => new Date(now - d * 86400000).toISOString();
  it("counts only the window", () => {
    const stamps = [daysAgo(1), daysAgo(5), daysAgo(10), daysAgo(29), daysAgo(45)];
    expect(postsPerWeek(stamps, 30, now)).toBeCloseTo(4 / (30 / 7));
  });
  it("returns null with no usable timestamps", () => {
    expect(postsPerWeek([undefined, "not-a-date"], 30, now)).toBeNull();
    expect(postsPerWeek([daysAgo(60)], 30, now)).toBeNull();
  });
});

describe("trendDirection", () => {
  it("detects rising", () => {
    expect(trendDirection([200, 220], [100, 120])).toBe("up");
  });
  it("detects declining", () => {
    expect(trendDirection([50, 60], [100, 120])).toBe("down");
  });
  it("treats small moves as flat", () => {
    expect(trendDirection([105], [100])).toBe("flat");
  });
  it("returns null on tiny/empty samples", () => {
    expect(trendDirection([], [100])).toBeNull();
    expect(trendDirection([100], [])).toBeNull();
  });
});

describe("engagementRate", () => {
  const post = (likes: number, comments: number) => ({ like_count: likes, comments_count: comments });
  it("uses avg engagement over followers", () => {
    // (110 + 90) / 2 = 100 avg ÷ 10000 followers = 1%
    expect(engagementRate([post(100, 10), post(85, 5)], 10000)).toBeCloseTo(1);
  });
  it("never divides by zero followers", () => {
    expect(engagementRate([post(10, 0)], 0)).toBeNull();
    expect(engagementRate([post(10, 0)], null)).toBeNull();
  });
  it("returns null with no posts", () => {
    expect(engagementRate([], 5000)).toBeNull();
  });
});

describe("engagementOf", () => {
  it("sums likes and comments, tolerating missing values", () => {
    expect(engagementOf({ like_count: 10, comments_count: 3 })).toBe(13);
    expect(engagementOf({})).toBe(0);
  });
});

// --- best-time bucketing (must be local-time, never UTC) ---
import { bestWindow, hourHistogram, hourLabel } from "./bestTime";

describe("bestWindow", () => {
  const at = (iso: string, e: number) => ({ t: iso, e });
  it("picks the highest-engagement weekday+hour bucket", () => {
    const posts = [
      at("2026-08-18T21:00:00Z", 100),
      at("2026-08-11T21:00:00Z", 90),
      at("2026-08-12T09:00:00Z", 5),
      at("2026-08-13T09:00:00Z", 5),
    ];
    const w = bestWindow(posts);
    expect(w).not.toBeNull();
    // The winning bucket is whichever local hour those two big posts land in.
    const d = new Date("2026-08-18T21:00:00Z");
    expect(w!.day).toBe(d.getDay());
    expect(w!.hour).toBe(d.getHours());
    expect(w!.short).toContain(hourLabel(d.getHours()));
  });
  it("returns null below the minimum sample", () => {
    expect(bestWindow([at("2026-08-18T21:00:00Z", 10)])).toBeNull();
  });
  it("ignores unparseable timestamps", () => {
    expect(bestWindow([at("nope", 1), at("also-nope", 2), at("bad", 3)])).toBeNull();
  });
});

describe("hourHistogram", () => {
  it("buckets into 12 two-hour slots and finds the hot one", () => {
    const d = new Date("2026-08-18T21:00:00Z");
    const { values, hot } = hourHistogram([{ t: d.toISOString(), e: 50 }]);
    expect(values).toHaveLength(12);
    expect(hot).toBe(Math.floor(d.getHours() / 2));
  });
});
