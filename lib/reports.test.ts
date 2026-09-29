import { describe, it, expect } from "vitest";
import { buildReport, reportToCsv, presetPeriod, customPeriod, periodLabel } from "./reports";
import type { IgMediaItem } from "./instagramSync";
import type { DailySnapshot } from "./dashboardMetrics";

const NOW = new Date("2026-09-30T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

// Posts across the current and previous 30-day windows so deltas compute.
const media: IgMediaItem[] = [
  { id: "p1", caption: "Big one", media_type: "REELS", like_count: 900, comments_count: 100, timestamp: day(3), permalink: "/p/p1" },
  { id: "p2", caption: "Mid", media_type: "REELS", like_count: 200, comments_count: 20, timestamp: day(10) },
  { id: "p3", caption: "Old", media_type: "REELS", like_count: 100, comments_count: 10, timestamp: day(40) },
];
const daily: DailySnapshot[] = [];

describe("buildReport", () => {
  it("builds an Instagram section with metrics, top posts and a period label", () => {
    const r = buildReport({ workspaceName: "Salvo's Pizza", now: NOW, days: 30, instagram: { handle: "salvo", media, daily, followers: 12000, baseline: 250 } });
    expect(r.workspaceName).toBe("Salvo's Pizza");
    expect(r.sections).toHaveLength(1);
    const ig = r.sections[0];
    expect(ig.platform).toBe("instagram");
    expect(ig.label).toContain("@salvo");
    expect(ig.metrics.find((m) => m.label === "Followers")?.raw).toBe(12000);
    // Top posts: only in-range, sorted by engagement, with a multiplier vs baseline.
    expect(ig.topPosts[0].caption).toBe("Big one");
    expect(ig.topPosts[0].engagements).toBe(1000);
    expect(ig.topPosts[0].multiplier).toBe(4); // 1000 / 250
    expect(ig.topPosts.some((p) => p.caption === "Old")).toBe(false);
  });

  it("adds a YouTube section only when asked and given data", () => {
    const r = buildReport({ workspaceName: "W", now: NOW, days: 7, youtube: { title: "Chan", views: 5000, minutes: 800, subs: 40 } });
    expect(r.sections).toHaveLength(1);
    expect(r.sections[0].platform).toBe("youtube");
    expect(r.sections[0].metrics.find((m) => m.label === "Views")?.raw).toBe(5000);
  });

  it("filters to one platform when requested", () => {
    const r = buildReport({ workspaceName: "W", now: NOW, days: 30, instagram: { handle: "s", media, daily, followers: 100, baseline: 10 }, youtube: { title: "C", views: 1, minutes: 1, subs: 1 }, platform: "youtube" });
    expect(r.sections.map((s) => s.platform)).toEqual(["youtube"]);
  });

  it("writes a deterministic summary only from real deltas", () => {
    const r = buildReport({ workspaceName: "W", now: NOW, days: 30, instagram: { handle: "s", media, daily, followers: 100, baseline: 10 } });
    expect(Array.isArray(r.summary)).toBe(true);
    // The posts line is always present when posts are counted.
    expect(r.summary.some((s) => /post/.test(s))).toBe(true);
  });
});

describe("reportToCsv", () => {
  it("quotes fields with commas/quotes and lays out metrics + top posts", () => {
    const r = buildReport({ workspaceName: "Salvo's, Pizza", now: NOW, days: 30, instagram: { handle: "s", media, daily, followers: 12000, baseline: 250 } });
    const csv = reportToCsv(r);
    expect(csv).toContain('"SOCIA report — Salvo\'s, Pizza"');
    expect(csv).toContain("Metric,Value,Change,Period");
    expect(csv).toContain("top posts");
    expect(csv.split("\n")[0]).toMatch(/^"/);
  });
});

describe("periods", () => {
  it("maps presets to day windows", () => {
    expect(presetPeriod("week", NOW).days).toBe(7);
    expect(presetPeriod("month", NOW).days).toBe(30);
    expect(presetPeriod("90", NOW).days).toBe(90);
    expect(presetPeriod("bogus", NOW).days).toBe(30);
  });

  it("builds a custom range and rejects an inverted one", () => {
    const p = customPeriod("2026-09-01", "2026-09-30", NOW);
    expect(p?.days).toBe(30);
    expect(customPeriod("2026-09-30", "2026-09-01", NOW)).toBeNull();
  });

  it("clamps a custom 'to' in the future to today", () => {
    const p = customPeriod("2026-09-28", "2027-01-01", NOW);
    expect(p!.days).toBe(3); // Sep 28,29,30
  });

  it("labels a window", () => {
    expect(periodLabel(30, NOW)).toMatch(/–/);
  });
});
