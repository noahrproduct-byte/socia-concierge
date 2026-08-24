import { describe, expect, it } from "vitest";
import {
  getFollowers,
  getFollowerGrowth,
  getFollowersGained,
  getPostsPublished,
  getLifetimePosts,
  getAverageLikes,
  getEngagementRate,
  getPerformanceBaseline,
  getTopPosts,
  getBestPostingWindow,
  getReach,
  getCompetitorActivity,
  changeVsPrevious,
  type AccountInput,
} from "./dashboardMetrics";
import { computeContentScore } from "./contentScore";

const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString();
const dayStr = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

const base = (over: Partial<AccountInput> = {}): AccountInput => ({
  followers: 12195,
  lifetimePosts: 1660,
  posts: [
    { like_count: 100, comments_count: 5, timestamp: daysAgo(2), caption: "a" },
    { like_count: 120, comments_count: 3, timestamp: daysAgo(5), caption: "b" },
    { like_count: 90, comments_count: 2, timestamp: daysAgo(40), caption: "c" },
  ],
  daily: [],
  syncedAt: new Date().toISOString(),
  platform: "instagram",
  handle: "acct",
  ...over,
});

describe("provenance", () => {
  it("marks platform values VERIFIED and derived values CALCULATED", () => {
    expect(getFollowers(base()).status).toBe("VERIFIED");
    expect(getLifetimePosts(base()).status).toBe("VERIFIED");
    expect(getEngagementRate(base()).status).toBe("CALCULATED");
    expect(getAverageLikes(base()).status).toBe("CALCULATED");
  });
  it("returns UNAVAILABLE rather than 0 when inputs are missing", () => {
    const m = getEngagementRate(base({ followers: null }));
    expect(m.status).toBe("UNAVAILABLE");
    expect(m.value).toBeNull();
    expect(getFollowers(base({ followers: null })).value).toBeNull();
    expect(getAverageLikes(base({ posts: [] })).value).toBeNull();
  });
});

describe("posts published vs lifetime posts", () => {
  it("counts only posts inside the period, never media_count", () => {
    const m = getPostsPublished(base(), 30);
    expect(m.value).toBe(2); // the 40-day-old post is excluded
    expect(getLifetimePosts(base()).value).toBe(1660);
  });
  it("reports zero posts as a confirmed zero", () => {
    expect(getPostsPublished(base({ posts: [] }), 7).value).toBe(0);
  });
});

describe("engagement rate", () => {
  it("uses avg(likes+comments)/followers*100", () => {
    const m = getEngagementRate(base());
    // (105 + 123 + 92) / 3 = 106.67 ; /12195*100 = 0.8747 -> 0.9
    expect(m.value).toBeCloseTo(0.9, 1);
  });
});

describe("baseline and multipliers", () => {
  it("uses the account average as the baseline", () => {
    const acct = base({
      posts: [
        { like_count: 2000, comments_count: 0, timestamp: daysAgo(1) },
        { like_count: 100, comments_count: 0, timestamp: daysAgo(2) },
        { like_count: 80, comments_count: 0, timestamp: daysAgo(3) },
      ],
    });
    // (2000 + 100 + 80) / 3 = 726.67
    expect(getPerformanceBaseline(acct).value).toBeCloseTo(726.67, 1);
    const { rows } = getTopPosts(acct, 1);
    expect(rows[0].multiplier).toBeCloseTo(2000 / 726.667, 2);
  });
});

describe("follower history", () => {
  it("requires a real snapshot before reporting growth", () => {
    expect(getFollowerGrowth(base(), 30).status).toBe("UNAVAILABLE");
  });
  it("computes growth from real snapshots", () => {
    const acct = base({ daily: [{ day: dayStr(45), followers: 12000, reach: null, views: null, followers_gained: null }] });
    expect(getFollowerGrowth(acct, 30).value).toBe(195);
  });
  it("sums Instagram's daily gains series", () => {
    const acct = base({
      daily: [
        { day: dayStr(3), followers: null, reach: null, views: null, followers_gained: 4 },
        { day: dayStr(2), followers: null, reach: null, views: null, followers_gained: 6 },
      ],
    });
    expect(getFollowersGained(acct, 30).value).toBe(10);
  });
});

describe("reach and competitors", () => {
  it("sums only real daily reach rows", () => {
    const acct = base({
      daily: [
        { day: dayStr(2), followers: null, reach: 1000, views: null, followers_gained: null },
        { day: dayStr(1), followers: null, reach: 500, views: null, followers_gained: null },
      ],
    });
    expect(getReach(acct, 30).value).toBe(1500);
  });
  it("never fabricates competitor activity", () => {
    expect(getCompetitorActivity().status).toBe("UNAVAILABLE");
  });
});

describe("best posting window", () => {
  it("stays unavailable below the minimum sample", () => {
    expect(getBestPostingWindow(base()).status).toBe("UNAVAILABLE");
  });
  it("flags low-confidence windows", () => {
    const posts = Array.from({ length: 6 }, (_, i) => ({
      like_count: 10,
      comments_count: 0,
      timestamp: daysAgo(i + 1),
    }));
    const m = getBestPostingWindow(base({ posts }));
    expect(m.status).toBe("CALCULATED");
    expect(m.value!.confident).toBe(false); // one post per weekday
  });
});

describe("period comparison", () => {
  it("computes percentage change", () => {
    expect(changeVsPrevious(120, 100).value).toBeCloseTo(20);
  });
  it("refuses to divide by a zero previous period", () => {
    expect(changeVsPrevious(120, 0).status).toBe("UNAVAILABLE");
    expect(changeVsPrevious(120, null).status).toBe("UNAVAILABLE");
  });
});

describe("content score", () => {
  it("returns null without enough evidence", () => {
    expect(computeContentScore(base().posts, 12195, [])).toBeNull();
    expect(computeContentScore([], null, [])).toBeNull();
  });
  it("scores only measurable dimensions", () => {
    const posts = Array.from({ length: 8 }, (_, i) => ({
      like_count: 120,
      comments_count: 4,
      timestamp: daysAgo(i + 1),
      caption: "hello",
    }));
    const s = computeContentScore(posts, 12195, [])!;
    expect(s).not.toBeNull();
    expect(s.dims.map((d) => d.label)).not.toContain("Reach"); // no reach data supplied
    expect(s.dims.map((d) => d.label)).not.toContain("Hook"); // never measurable
    expect(s.score).toBeGreaterThanOrEqual(0);
    expect(s.score).toBeLessThanOrEqual(100);
  });
  it("includes Reach only when daily reach exists", () => {
    const posts = Array.from({ length: 8 }, (_, i) => ({
      like_count: 120, comments_count: 4, timestamp: daysAgo(i + 1), caption: "x",
    }));
    const s = computeContentScore(posts, 12195, [900, 1000, 1100])!;
    expect(s.dims.map((d) => d.label)).toContain("Reach");
  });
});
