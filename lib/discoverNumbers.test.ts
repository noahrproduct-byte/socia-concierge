import { describe, expect, it } from "vitest";
import { fmtRate } from "./metrics";
import { discoveryStats } from "./igBusinessDiscovery";

describe("small engagement rates", () => {
  it("never round a real rate down to 0.0%", () => {
    // predis.ai, 2026-11-16: 5 likes + 2 comments on 23K followers.
    expect(fmtRate((7 / 23000) * 100)).toBe("0.03%");
    expect(fmtRate(0.15)).toBe("0.15%");
    expect(fmtRate(0)).toBe("0%");
    expect(fmtRate(2.34)).toBe("2.3%");
    expect(fmtRate(3)).toBe("3%");
    expect(fmtRate(12.6)).toBe("13%");
  });
});

describe("posts a week", () => {
  const day = 86_400_000;
  const post = (i: number) => ({ timestamp: new Date(Date.UTC(2026, 10, 1) + i * day).toISOString(), likes: 10, comments: 0 });
  it("counts gaps, not posts: 12 posts a day apart is 7 a week", () => {
    expect(discoveryStats({ followers: 100, media: Array.from({ length: 12 }, (_, i) => post(i)) }).postsPerWeek).toBeCloseTo(7);
  });
  it("leaves out posts with hidden likes from engagement", () => {
    const s = discoveryStats({ followers: 1000, media: [post(0), { ...post(1), likes: null }, post(2)] });
    expect(s.engagementRate).toBeCloseTo(1);
  });
});
