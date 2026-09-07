import { describe, expect, it } from "vitest";
import { followerPoints, bucketFollowers, summarizeFollowers } from "./followers";

const pts = followerPoints([
  { day: "2026-09-01", followers: 100 }, { day: "2026-09-02", followers: 110 }, { day: "2026-09-03", followers: null },
  { day: "2026-09-07", followers: 130 }, { day: "2026-09-08", followers: 128 },
]);

describe("follower buckets", () => {
  it("weekly buckets carry the ending count and the net change, never a sum", () => {
    const w = bucketFollowers(pts, "week", "2026-09-08");
    expect(w.map((b) => b.followers)).toEqual([110, 128]);   // week of Aug 31 ends Sep 2; week of Sep 7 ends Sep 8
    expect(w[0].net).toBeNull();
    expect(w[1].net).toBe(18);
    expect(w[1].partial).toBe(true);
  });
  it("monthly bucket ends on the last snapshot", () => {
    const m = bucketFollowers(pts, "month", "2026-10-01");
    expect(m).toHaveLength(1);
    expect(m[0].end).toBe("2026-09-08");
    expect(m[0].partial).toBe(false);
  });
});

describe("summary", () => {
  it("computes net, growth and average daily change over the span", () => {
    const s = summarizeFollowers(pts);
    expect(s.net).toBe(28);
    expect(s.growthPct).toBeCloseTo(28);
    expect(s.spanDays).toBe(7);
    expect(s.avgDailyNet).toBeCloseTo(4);
    expect(s.daysCollected).toBe(4);
    expect(s.statusLine).toContain("4 days of follower history");
  });
  it("explains a single snapshot instead of pretending", () => {
    const s = summarizeFollowers(pts.slice(0, 1));
    expect(s.net).toBeNull();
    expect(s.statusLine).toBe("Follower tracking started today.");
  });
});
