import { describe, it, expect } from "vitest";
import { buildAllPlatforms, type PlatformSummary } from "./allPlatforms";

const s = (over: Partial<PlatformSummary>): PlatformSummary => ({
  platform: "instagram", connected: true, label: "IG", audience: null, audienceLabel: "followers",
  views: null, viewsNote: null, engagement: null, contentPublished: null, ...over,
});

describe("buildAllPlatforms — only valid combinations", () => {
  const summaries = [
    s({ platform: "instagram", label: "@salvo", audience: 1200, views: 5000, engagement: 800, contentPublished: 10 }),
    s({ platform: "youtube", label: "Salvo TV", audienceLabel: "subscribers", audience: 300, views: 9000, engagement: null, contentPublished: null }),
    s({ platform: "facebook", label: "Salvo FB", audience: 500, views: null, engagement: 200, contentPublished: 4 }),
    s({ platform: "tiktok", connected: false, label: "TikTok" }),
  ];

  it("sums audience across platforms (a valid level combination)", () => {
    const d = buildAllPlatforms(summaries);
    expect(d.combined.audience.value).toBe(1200 + 300 + 500);
  });

  it("sums content published (valid counts), excluding platforms that don't report it", () => {
    const d = buildAllPlatforms(summaries);
    expect(d.combined.contentPublished.value).toBe(10 + 4); // YouTube null excluded
  });

  it("sums engagement as DIRECTIONAL and says so", () => {
    const d = buildAllPlatforms(summaries);
    expect(d.combined.engagement.value).toBe(800 + 200);
    expect(d.combined.engagement.note.toLowerCase()).toMatch(/directional/);
  });

  it("never produces a combined views/reach field", () => {
    const d = buildAllPlatforms(summaries);
    expect((d.combined as Record<string, unknown>).views).toBeUndefined();
    expect((d.combined as Record<string, unknown>).reach).toBeUndefined();
  });

  it("orders connected platforms by audience and keeps disconnected ones last", () => {
    const d = buildAllPlatforms(summaries);
    expect(d.platforms[0].platform).toBe("instagram"); // 1200 largest
    expect(d.platforms[d.platforms.length - 1].connected).toBe(false);
    expect(d.connectedCount).toBe(3);
  });

  it("names the largest-audience platform in an insight", () => {
    const d = buildAllPlatforms(summaries);
    expect(d.insights.some((i) => i.id === "audience" && /Instagram/.test(i.body))).toBe(true);
  });

  it("reports presence for every platform, connected or not", () => {
    const d = buildAllPlatforms(summaries);
    expect(d.presence).toHaveLength(4);
    expect(d.presence.find((p) => p.platform === "tiktok")?.connected).toBe(false);
  });

  it("degrades to a single honest insight when nothing can be compared yet", () => {
    const d = buildAllPlatforms([s({ platform: "instagram", audience: 10, engagement: null, contentPublished: null })]);
    expect(d.insights).toHaveLength(1);
    expect(d.insights[0].id).toBe("collecting");
  });
});
