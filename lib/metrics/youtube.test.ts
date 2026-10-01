import { describe, it, expect } from "vitest";
import { buildYouTubeAnalytics, fmtClock, fmtHours } from "./youtube";
import type { YouTubeAnalytics, YtDailyExt, YtDeep, YtVideoStat } from "../youtubeData";
import type { YtVideo } from "../youtube";

const NOW = new Date("2026-09-30T12:00:00Z");
const DAY = 86400000;
const dayStr = (d: Date) => d.toISOString().slice(0, 10);

/** Daily rows ending two days before NOW (YouTube's reporting lag): the last
 *  30 days at `cur` views/day, the 30 before at `prev`. */
function daily(cur: number, prev: number): YtDailyExt[] {
  const last = new Date("2026-09-28T00:00:00Z");
  const out: YtDailyExt[] = [];
  for (let i = 59; i >= 0; i--) {
    const v = i < 30 ? cur : prev;
    out.push({ day: dayStr(new Date(last.getTime() - i * DAY)), views: v, minutes: v * 2, subsGained: i < 30 ? 4 : 2, subsLost: 1, likes: 3, comments: 1, shares: 1 });
  }
  return out;
}

const stat = (id: string, views: number, over: Partial<YtVideoStat> = {}): YtVideoStat => ({
  videoId: id, views, minutes: views * 2, avgViewDurationSec: 120, avgViewPercentage: 40, likes: 10, comments: 2, shares: 1, subsGained: 1, ...over,
});
const meta = (id: string, over: Partial<YtVideo> = {}): YtVideo => ({
  videoId: id, title: `Video ${id}`, publishedAt: "2026-09-20T15:00:00Z", thumb: null, views: 1000, likes: 10, comments: 2, durationSec: 300, ...over,
});

function deep(over: Partial<YtDeep> = {}): YtDeep {
  const stats = [stat("a", 9000), stat("b", 1000), stat("c", 900), stat("d", 800), stat("e", 700), stat("f", 600)];
  return {
    daily: daily(100, 50),
    avgViewPercentage: { current: 40, previous: 38 },
    videoStats: stats,
    videoMeta: Object.fromEntries(stats.map((s) => [s.videoId, meta(s.videoId)])),
    shortsIds: ["d", "e", "f"],
    contentTypes: [{ key: "VIDEO_ON_DEMAND", views: 10900, minutes: 21800 }, { key: "SHORTS", views: 2100, minutes: 900 }],
    traffic: [{ key: "YT_SEARCH", views: 700, minutes: 1400 }, { key: "RELATED_VIDEO", views: 300, minutes: 600 }],
    devices: [{ key: "MOBILE", views: 800, minutes: 1500 }, { key: "DESKTOP", views: 200, minutes: 500 }],
    countries: [{ key: "US", views: 900, minutes: 1800 }, { key: "CA", views: 100, minutes: 200 }],
    uploads: ["a", "b", "c", "d", "e", "f"].map((id) => meta(id)),
    ...over,
  };
}

const yt = (over: Partial<YouTubeAnalytics> = {}): YouTubeAnalytics => ({
  channel: { title: "Salvo's Pizza", handle: "@salvos", avatar: null, subscribers: 1200, totalViews: 90000, videoCount: 6 },
  range: { views: 3000, minutes: 6000, subs: 120 },
  series: [],
  topVideos: [],
  demographics: [{ label: "25-34", value: 60 }],
  genders: [{ label: "Male", value: 55 }, { label: "Female", value: 45 }],
  note: null,
  deep: deep(),
  ...over,
});

const build = (y: YouTubeAnalytics) => buildYouTubeAnalytics({ yt: y, days: 30, rangeLabel: "Last 30 days", now: NOW });

describe("formatters", () => {
  it("formats durations and hours", () => {
    expect(fmtClock(247)).toBe("4:07");
    expect(fmtClock(null)).toBe("—");
    expect(fmtHours(90)).toBe("1.5 h");
    expect(fmtHours(null)).toBe("—");
  });
});

describe("buildYouTubeAnalytics — windows end on the last day YouTube reported", () => {
  it("aligns the current and previous period to the reported day, not today", () => {
    const d = build(yt());
    expect(d.lastDay).toBe("2026-09-28");
    expect(d.series.views.current).toHaveLength(30);
    expect(d.series.views.current[29].day).toBe("2026-09-28");
    expect(d.series.views.previous).toHaveLength(30);
    // No day after the last reported one is drawn as a zero.
    expect(d.series.views.current.some((p) => p.day > "2026-09-28")).toBe(false);
  });

  it("computes real period totals and deltas", () => {
    const d = build(yt());
    expect(d.series.views.total).toBe(3000);
    expect(d.series.views.prevTotal).toBe(1500);
    const v = d.kpis.find((k) => k.key === "views")!;
    expect(v.value).toBe("3K");
    expect(v.delta).toBe("↑ 100%");
    expect(v.positive).toBe(true);
  });

  it("derives average view duration from watch time ÷ views", () => {
    const d = build(yt());
    // 2 minutes watched per view → 2:00
    expect(d.kpis.find((k) => k.key === "avd")!.value).toBe("2:00");
  });

  it("reports NET subscribers (gained − lost) when YouTube returns losses", () => {
    const d = build(yt());
    expect(d.subscribers.gained).toBe(120);
    expect(d.subscribers.lost).toBe(30);
    expect(d.subscribers.net).toBe(90);
    expect(d.kpis.find((k) => k.key === "subs")!.label).toBe("Net subscribers");
  });
});

describe("buildYouTubeAnalytics — videos, formats and insights", () => {
  it("ranks in-range videos and measures them against the median", () => {
    const d = build(yt());
    expect(d.videoBasis).toBe("range");
    expect(d.videos[0].id).toBe("a");
    expect(d.medianViews).toBe(850);
    expect(d.videos[0].multiplier).toBeCloseTo(9000 / 850, 5);
  });

  it("labels Shorts only from YouTube's own classification", () => {
    const d = build(yt());
    expect(d.videos.find((v) => v.id === "d")!.type).toBe("Short");
    expect(d.videos.find((v) => v.id === "a")!.type).toBe("Video");
    const unknown = build(yt({ deep: deep({ shortsIds: null }) }));
    expect(unknown.videos.every((v) => v.type === null)).toBe(true); // never guessed from length
  });

  it("raises a breakout insight only when a video clears 3× the median", () => {
    const d = build(yt());
    const b = d.insights.find((i) => i.id === "breakout")!;
    expect(b.title).toMatch(/your typical video's views/);
    expect(b.postIds).toEqual(["a"]);
    const flat = build(yt({ deep: deep({ videoStats: [stat("a", 1000), stat("b", 1000), stat("c", 900), stat("d", 800), stat("e", 700)] }) }));
    expect(flat.insights.find((i) => i.id === "breakout")).toBeUndefined();
  });

  it("judges retention among long-form videos only — a Short never wins on % viewed", () => {
    const stats = [
      stat("a", 3000, { avgViewPercentage: 70 }), // long-form, clearly above its peers
      stat("b", 2500, { avgViewPercentage: 40 }),
      stat("c", 2400, { avgViewPercentage: 42 }),
      stat("g", 2300, { avgViewPercentage: 38 }),
      stat("d", 2200, { avgViewPercentage: 95 }), // Shorts: high % viewed by nature
      stat("e", 2100, { avgViewPercentage: 92 }),
    ];
    const d = build(yt({ deep: deep({ videoStats: stats, videoMeta: Object.fromEntries(stats.map((s) => [s.videoId, meta(s.videoId)])), shortsIds: ["d", "e"] }) }));
    const r = d.insights.find((i) => i.id === "retention")!;
    expect(r.postIds).toEqual(["a"]);
    expect(r.body).toMatch(/other long-form videos typically hold 40%/);
  });

  it("shows no arrow for a change that rounds to zero", () => {
    const d = build(yt({ deep: deep({ daily: daily(100, 100) }) }));
    expect(d.kpis.find((k) => k.key === "views")!.delta).toBeNull();
    expect(d.changes.find((c) => c.key === "views")!.delta).toBeNull();
  });

  it("turns insights into next steps and evidence cards", () => {
    const d = build(yt());
    expect(d.nextSteps.length).toBeGreaterThan(0);
    expect(d.evidence.find((p) => p.id === "a")?.platform).toBe("youtube");
  });

  it("names where viewers came from", () => {
    const d = build(yt());
    expect(d.audience.traffic?.[0]).toMatchObject({ label: "YouTube search" });
    expect(d.audience.traffic?.[0].share).toBeCloseTo(0.7, 5);
    expect(d.audience.countries?.[0].label).toBe("United States");
    expect(d.insights.find((i) => i.id === "traffic")?.title).toMatch(/70% of your views came from YouTube search/);
  });
});

describe("buildYouTubeAnalytics — honest fallbacks", () => {
  it("without the richer reports: lifetime video totals, no previous period, engagement unavailable", () => {
    const light = yt({
      deep: null,
      series: [{ day: "2026-09-27", views: 10, minutes: 20, subs: 1 }, { day: "2026-09-28", views: 30, minutes: 60, subs: 2 }],
      topVideos: [meta("x", { views: 500 }), meta("y", { views: 100 })],
    });
    const d = build(light);
    expect(d.videoBasis).toBe("lifetime");
    expect(d.series.engagement.provenance).toBe("unavailable");
    expect(d.series.views.previous).toHaveLength(0);
    expect(d.kpis.find((k) => k.key === "views")!.delta).toBeNull();
    expect(d.kpis.find((k) => k.key === "subs")!.label).toBe("Subscribers gained"); // losses unknown → not "net"
    expect(d.subscribers.net).toBeNull();
  });

  it("a report YouTube didn't return stays null and is listed as unavailable", () => {
    const d = build(yt({ deep: deep({ traffic: null, contentTypes: null, videoStats: null }) }));
    expect(d.audience.traffic).toBeNull();
    expect(d.formats).toBeNull();
    const labels = d.unavailable.map((u) => u.label).join(" | ");
    expect(labels).toMatch(/Per-video stats/);
    expect(labels).toMatch(/Shorts vs long-form/);
    expect(labels).toMatch(/click-through rate/);
  });

  it("with no data at all, nothing is a zero", () => {
    const d = build(yt({ deep: null, series: [], range: null, note: "YouTube Analytics has no data for this period yet." }));
    expect(d.lastDay).toBeNull();
    expect(d.kpis.find((k) => k.key === "views")!.value).toBe("—");
    expect(d.series.views.provenance).toBe("unavailable");
    expect(d.changes).toHaveLength(0);
  });
});
