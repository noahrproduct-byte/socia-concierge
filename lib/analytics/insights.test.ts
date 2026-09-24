import { describe, it, expect } from "vitest";
import { accountInsights, crossPlatformInsights } from "./insights";
import { aggregateAccounts } from "./aggregate";
import type { ContentFormat, Metric, NormalizedAccountAnalytics, NormalizedPost, Platform } from "./types";

const NOW = new Date("2026-09-24T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

function mkPost(id: string, format: ContentFormat, engagement: number | null, multiplier: number | null, views: number | null = null, dayAgo = 1): NormalizedPost {
  return { id, platform: "instagram", format, title: id, caption: id, publishedAt: daysAgo(dayAgo), thumb: null, permalink: null, metrics: { views }, engagement, multiplier };
}
const metric = (value: number | null): Metric => ({ value, status: value == null ? "UNAVAILABLE" : "VERIFIED", source: "src", method: "m", period: "p", sampleSize: null });
function mkAcc(platform: Platform, opts: Partial<NormalizedAccountAnalytics> = {}): NormalizedAccountAnalytics {
  return {
    account: { platform, accountId: platform, handle: platform, name: platform, avatar: null, audienceLabel: platform === "youtube" ? "Subscribers" : "Followers", connectedAt: null, syncedAt: null },
    kpis: {},
    series: {},
    posts: [],
    demographics: { status: "unavailable", reason: "", basis: "", dimensions: {} },
    baseline: {},
    collecting: false,
    ...opts,
  };
}

describe("account insight engine", () => {
  const posts = [
    mkPost("p1", "reel", 500, 5, 20000, 2), // breakout
    ...Array.from({ length: 6 }, (_, i) => mkPost(`n${i}`, "reel", 100, 1, 4000, i + 3)),
  ];

  it("surfaces a breakout only when a baseline exists", () => {
    const withBase = accountInsights(mkAcc("instagram", { posts, baseline: { all: 100, reel: 100 } }));
    expect(withBase.some((i) => i.kind === "breakout")).toBe(true);

    const noBase = accountInsights(mkAcc("instagram", { posts, baseline: {} }));
    expect(noBase.every((i) => i.kind !== "breakout")).toBe(true);
  });

  it("never invents an insight from an empty account", () => {
    expect(accountInsights(mkAcc("facebook", { posts: [], baseline: {} }))).toEqual([]);
  });
});

describe("cross-platform insights", () => {
  it("needs at least two accounts", () => {
    expect(crossPlatformInsights([mkAcc("instagram")])).toEqual([]);
  });

  it("names the audience-growth leader from real net adds", () => {
    const ig = mkAcc("instagram", { series: { net_followers: { metric: "net_followers", label: "New followers", unit: "count", provenance: "platform_daily", trueSeries: true, render: "bar", note: "", current: [], previous: [], total: 52, prevTotal: null } } });
    const yt = mkAcc("youtube", { series: { net_followers: { metric: "net_followers", label: "Net subscribers", unit: "count", provenance: "platform_daily", trueSeries: true, render: "bar", note: "", current: [], previous: [], total: 120, prevTotal: null } } });
    const out = crossPlatformInsights([ig, yt]);
    const growth = out.find((i) => i.id === "platform-growth");
    expect(growth).toBeTruthy();
    expect(growth!.title).toContain("YouTube"); // 120 > 52
  });
});

describe("all-accounts aggregation", () => {
  const ig = mkAcc("instagram", { kpis: { views: metric(7000), engagement: metric(5000), followers: metric(12200) } });
  const yt = mkAcc("youtube", { kpis: { views: metric(116), followers: metric(333) }, series: { net_followers: { metric: "net_followers", label: "Net subscribers", unit: "count", provenance: "platform_daily", trueSeries: true, render: "bar", note: "", current: [], previous: [], total: 12, prevTotal: null } } });

  it("sums additive counts but keeps combined audience separate", () => {
    const all = aggregateAccounts([ig, yt]);
    expect(all.totals.views).toBe(7116);
    expect(all.totals.engagement).toBe(5000); // only IG reported it
    expect(all.totals.followers).toBe(12533); // summed, but flagged in UI as not-unique
    expect(all.audiencePlatforms).toEqual(["Instagram", "YouTube"]);
  });

  it("never forms a cross-platform ratio total", () => {
    const all = aggregateAccounts([ig, yt]);
    expect("engagement_rate" in all.totals).toBe(false);
  });

  it("builds a view share that sums to ~1 across reporting platforms", () => {
    const all = aggregateAccounts([ig, yt]);
    const sum = all.platforms.reduce((s, p) => s + p.share, 0);
    expect(sum).toBeCloseTo(1, 5);
    expect(all.platforms[0].platform).toBe("instagram"); // most views
  });
});
