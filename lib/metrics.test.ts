import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  engagementOf,
  median,
  outlierMultiplier,
  pctChange,
  postsPerWeek,
  trendDirection,
  engagementRate,
  fmtMult,
  isChartableDay,
  localDayStr,
  DAILY_SERIES_SOURCE,
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

describe("daily-series provenance", () => {
  const today = "2026-08-25";
  const meta = (day: string) => ({ day, source: DAILY_SERIES_SOURCE });

  it("charts a finished day from Meta's daily series", () => {
    expect(isChartableDay(meta("2026-08-24"), today)).toBe(true);
  });

  it("refuses today, which is still accumulating", () => {
    expect(isChartableDay(meta(today), today)).toBe(false);
  });

  it("refuses a counter read taken at sync time", () => {
    expect(isChartableDay({ day: "2026-08-24", source: "socia_snapshot" }, today)).toBe(false);
  });

  it("refuses a row with no recorded provenance", () => {
    expect(isChartableDay({ day: "2026-08-24", source: null }, today)).toBe(false);
  });

  it("reports the local calendar day, not the UTC one", () => {
    const d = new Date(2026, 7, 25, 23, 30); // 11:30pm local, whatever the zone
    expect(localDayStr(d)).toBe("2026-08-25");
  });
});

import { accountLimit, ACCOUNT_LIMIT } from "./plan";

describe("plan gating", () => {
  it("free connects one Instagram account", () => {
    expect(accountLimit("free")).toBe(1);
  });
  it("pro connects up to three", () => {
    expect(accountLimit("pro")).toBe(3);
  });
  it("no plan grants unlimited accounts", () => {
    for (const n of Object.values(ACCOUNT_LIMIT)) expect(Number.isFinite(n)).toBe(true);
  });
});

import { aiFailureKind, AI_UNAVAILABLE_COPY } from "./anthropic";

describe("AI availability", () => {
  const KEY = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => { process.env.ANTHROPIC_API_KEY = "test-key"; });
  afterEach(() => {
    if (KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = KEY;
  });

  it("recognises an exhausted credit balance", () => {
    const err = new Error('400 {"type":"error","error":{"message":"Your credit balance is too low to access the Anthropic API."}}');
    expect(aiFailureKind(err)).toBe("no_credit");
  });

  it("recognises rate limiting", () => {
    expect(aiFailureKind(new Error("429 rate limit exceeded"))).toBe("rate_limited");
  });

  it("reports a missing key ahead of any error text", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(aiFailureKind(new Error("credit balance too low"))).toBe("no_key");
  });

  it("falls back to a generic failure", () => {
    expect(aiFailureKind(new Error("socket hang up"))).toBe("failed");
  });

  it("gives every kind actionable copy", () => {
    for (const [kind, copy] of Object.entries(AI_UNAVAILABLE_COPY)) {
      expect(copy.length).toBeGreaterThan(20);
      expect(kind).toBeTruthy();
    }
  });
});

import {
  goalKind, buildQueries, scoreAccount, classifyAccount, scoreContent,
  detectTrendTags, dedupeAccounts, dedupeContent, canonicalUrl, rollUpTrends,
  type DiscoveryProfile, type AccountCandidate, type ContentCandidate,
} from "./discovery";

const profile = (over: Partial<DiscoveryProfile> = {}): DiscoveryProfile => ({
  niche: "Pizza / Italian food", subNiche: "Neapolitan pizza", brandName: "Salvo's",
  location: "Nashville, Tennessee", description: null, goalText: "more local customers",
  goal: "local_awareness", ownHandle: "salvoshermitage", ownFollowers: 12000,
  ownFormats: ["VIDEO"], ...over,
});

const acct = (over: Partial<AccountCandidate> = {}): AccountCandidate => ({
  platform: "youtube", platformAccountId: "UC1", handle: "x", displayName: "X",
  profileImage: null, profileUrl: null, followers: null, location: null, category: null,
  dataSource: "youtube_api", ...over,
});

describe("discovery: goals", () => {
  it("reads local intent from free text", () => {
    expect(goalKind("get more local customers into the restaurant")).toBe("local_awareness");
  });
  it("reads growth intent", () => {
    expect(goalKind("grow my followers")).toBe("followers");
  });
  it("returns unknown rather than guessing", () => {
    expect(goalKind("")).toBe("unknown");
    expect(goalKind(null)).toBe("unknown");
  });
});

describe("discovery: queries", () => {
  it("builds location-aware queries when the goal is local", () => {
    const qs = buildQueries(profile()).map((q) => q.q);
    expect(qs.some((q) => q.includes("Nashville"))).toBe(true);
  });
  it("returns nothing without a niche, rather than searching blindly", () => {
    expect(buildQueries(profile({ niche: null, subNiche: null }))).toEqual([]);
  });
  it("never repeats a query", () => {
    const qs = buildQueries(profile()).map((q) => q.q.toLowerCase());
    expect(new Set(qs).size).toBe(qs.length);
  });
});

describe("discovery: scoring uses only real signals", () => {
  it("scores a sparse candidate below a rich one", () => {
    const sparse = scoreAccount(acct({ displayName: "Random", dataSource: "web_research" }), profile());
    const rich = scoreAccount(
      acct({ displayName: "Nashville Pizza Co", followers: 20000, engagementRate: 4, uploadsPerWeek: 2, medianViews: 15000 }),
      profile(),
    );
    expect(rich.relevanceScore).toBeGreaterThan(sparse.relevanceScore);
  });
  it("explains every score with reasons", () => {
    const s = scoreAccount(acct({ displayName: "Nashville Pizza", followers: 15000 }), profile());
    expect(s.relevanceReasons.length).toBeGreaterThan(0);
  });
  it("never exceeds 100", () => {
    const s = scoreAccount(
      acct({ displayName: "Nashville Neapolitan Pizza", followers: 14000, engagementRate: 9, uploadsPerWeek: 5, medianViews: 40000, location: "Nashville" }),
      profile(),
    );
    expect(s.relevanceScore).toBeLessThanOrEqual(100);
  });
  it("weights local higher when the goal is local", () => {
    const local = acct({ displayName: "Nashville Pizza", followers: 15000 });
    const asLocal = scoreAccount(local, profile({ goal: "local_awareness" })).relevanceScore;
    const asFollowers = scoreAccount(local, profile({ goal: "followers" })).relevanceScore;
    expect(asLocal).toBeGreaterThan(asFollowers);
  });
});

describe("discovery: classification", () => {
  it("calls a local account local", () => {
    expect(classifyAccount(acct({ displayName: "Nashville Pizza Co" }), profile())).toBe("local_competitor");
  });
  it("calls a much bigger account a niche leader", () => {
    expect(classifyAccount(acct({ displayName: "Pizza World", followers: 2_000_000 }), profile())).toBe("niche_leader");
  });
  it("spots an emerging creator outperforming its size", () => {
    expect(classifyAccount(acct({ displayName: "Tiny Pizza", followers: 8000, medianViews: 40000 }), profile())).toBe("emerging_creator");
  });
});

describe("discovery: content", () => {
  const content = (over: Partial<ContentCandidate> = {}): ContentCandidate => ({
    platform: "youtube", contentUrl: "https://youtube.com/watch?v=abc", accountHandle: "a",
    accountName: "A", accountImage: null, thumbnailUrl: null, title: "Pizza POV",
    publishedAt: new Date().toISOString(), contentType: "short", views: 1000, likes: 10,
    comments: 2, multiplier: null, dataSource: "youtube_api", why: null, ...over,
  });

  it("detects format tags from the title only", () => {
    expect(detectTrendTags("POV: you order the pizza")).toContain("POV");
    expect(detectTrendTags("3 mistakes people make")).toContain("Listicle hook");
    expect(detectTrendTags(null)).toEqual([]);
    expect(detectTrendTags("   ")).toEqual([]);
  });

  // Real titles the first vocabulary missed entirely — it was written for
  // English hook-style headlines, which is not what these niches publish.
  it("tags the title shapes that actually appear in short-form food video", () => {
    expect(detectTrendTags("Italian pizza vs AMERICAN pizza")).toContain("Comparison");
    expect(detectTrendTags("1 Second vs 1 Hour Pizza")).toContain("Time contrast");
    expect(detectTrendTags("3 Levels of Pizza")).toContain("Levels / tiers");
    expect(detectTrendTags("I Ordered The World's Largest Pizza Slice"))
      .toEqual(expect.arrayContaining(["First-person challenge", "Superlative"]));
    expect(detectTrendTags("They kept DESTROYING PIZZA")).toContain("High-drama framing");
    expect(detectTrendTags("60 Secondi con un Pizzaiolo")).toContain("People on camera");
    expect(detectTrendTags("Pizza Match Cut Today. What Transition Next?"))
      .toContain("Camera technique");
  });

  it("never repeats a tag when several rules match", () => {
    const tags = detectTrendTags("I tried the world's best cheapest pizza vs the most expensive");
    expect(new Set(tags).size).toBe(tags.length);
  });
  it("rewards a real multiplier, not a guessed one", () => {
    const withMult = scoreContent(content({ multiplier: 4 }), profile()).relevanceScore;
    const without = scoreContent(content({ multiplier: null }), profile()).relevanceScore;
    expect(withMult).toBeGreaterThan(without);
  });
  it("rolls up only patterns appearing more than once", () => {
    const xs = [content({ title: "POV pizza", contentUrl: "u1" }), content({ title: "POV dough", contentUrl: "u2" }), content({ title: "Review", contentUrl: "u3" })]
      .map((c) => scoreContent(c, profile()));
    const tags = rollUpTrends(xs).map((t) => t.tag);
    expect(tags).toContain("POV");
    expect(tags).not.toContain("Review");
  });
});

describe("discovery: deduplication", () => {
  it("merges the same channel found twice, keeping the better score", () => {
    const a = scoreAccount(acct({ platformAccountId: "UC9", displayName: "Pizza" }), profile());
    const b = scoreAccount(acct({ platformAccountId: "UC9", displayName: "Nashville Pizza", followers: 15000 }), profile());
    expect(dedupeAccounts([a, b])).toHaveLength(1);
  });
  it("treats tracking params as the same URL", () => {
    expect(canonicalUrl("https://youtube.com/watch?v=abc&utm_source=x"))
      .toBe(canonicalUrl("https://youtube.com/watch?v=abc"));
  });
  it("stores one row per canonical content URL", () => {
    const mk = (u: string) => scoreContent({
      platform: "youtube", contentUrl: u, accountHandle: null, accountName: null, accountImage: null,
      thumbnailUrl: null, title: "Pizza", publishedAt: null, contentType: "short", views: 1,
      likes: null, comments: null, multiplier: null, dataSource: "youtube_api", why: null,
    }, profile());
    expect(dedupeContent([mk("https://x.com/a?utm_source=1"), mk("https://x.com/a")])).toHaveLength(1);
  });
});
