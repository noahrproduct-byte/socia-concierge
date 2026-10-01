import { describe, it, expect } from "vitest";
import { buildTikTokAnalytics, ttVideoEngagement } from "./tiktok";
import type { TtVideo } from "../tiktokAuth";

const NOW = new Date("2026-09-30T12:00:00Z");

const video = (over: Partial<TtVideo> = {}): TtVideo => ({
  id: "v1", createdAt: "2026-09-20T10:00:00Z", cover: null, url: "https://tiktok.com/v1", caption: "A clip", durationSec: 20,
  views: 1000, likes: 100, comments: 10, shares: 5, ...over,
});

describe("ttVideoEngagement", () => {
  it("sums only returned counts, null when none", () => {
    expect(ttVideoEngagement(video({ likes: 100, comments: 10, shares: 5 }))).toBe(115);
    expect(ttVideoEngagement(video({ likes: null, comments: null, shares: null }))).toBeNull();
  });
});

describe("buildTikTokAnalytics", () => {
  const row = {
    display_name: "Salvo's", username: "salvos", avatar_url: null, is_verified: true,
    follower_count: 5000, likes_count: 120000, video_count: 42,
    videos: [video({ id: "a", views: 500 }), video({ id: "b", views: 9000, likes: 800 }), video({ id: "c", views: 100 })],
  };

  it("shows real profile counts as stats", () => {
    const d = buildTikTokAnalytics({ row, days: 30, rangeLabel: "Last 30 days", now: NOW });
    expect(d.stats.find((s) => s.key === "followers")?.value).toBe("5,000");
    expect(d.stats.find((s) => s.key === "videos")?.value).toBe("42");
    expect(d.profile.verified).toBe(true);
  });

  it("ranks top videos by views when present", () => {
    const d = buildTikTokAnalytics({ row, days: 30, rangeLabel: "Last 30 days", now: NOW });
    expect(d.topVideos[0].id).toBe("b"); // 9000 views
  });

  it("never fabricates a daily trend — states history is unavailable", () => {
    const d = buildTikTokAnalytics({ row, days: 30, rangeLabel: "Last 30 days", now: NOW });
    expect(d.historyNote).toMatch(/doesn't provide a day-by-day/i);
    expect(d.unavailable.map((u) => u.label).join(" ")).toMatch(/Daily performance trend/);
  });

  it("degrades honestly with an empty connection", () => {
    const d = buildTikTokAnalytics({ row: {}, days: 30, rangeLabel: "Last 30 days", now: NOW });
    expect(d.stats.find((s) => s.key === "followers")?.value).toBe("—");
    expect(d.stats.find((s) => s.key === "followers")?.status).toBe("unavailable");
    expect(d.topVideos).toHaveLength(0);
  });
});
