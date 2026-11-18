import { describe, expect, it } from "vitest";
import { isYoutubeTwin, sameCreatorName, YOUTUBE_TWIN } from "./discovery";

describe("Instagram twins of YouTube creators", () => {
  it("count only under a matching name", () => {
    expect(sameCreatorName("Liam Ottley", "Liam Ottley | AI Agency")).toBe(true);
    expect(sameCreatorName("liamottley", "Liam Ottley")).toBe(true);
    expect(sameCreatorName("Kube", "Kube")).toBe(true);
    expect(sameCreatorName("Pizza Palace", "Liam Ottley")).toBe(false);
    expect(sameCreatorName(null, "Liam Ottley")).toBe(false);
    expect(sameCreatorName("AI", "AI with Hassan")).toBe(false);
  });
  it("are marked on stored rows", () => {
    expect(isYoutubeTwin({ relevance_reasons: [YOUTUBE_TWIN] })).toBe(true);
    expect(isYoutubeTwin({ relevance_reasons: ["Same niche"] })).toBe(false);
  });
});

describe("viral for creators", () => {
  it("counts 15K for everyone, and a 5x breakout from 5K views for creators only", async () => {
    const { isViralFor } = await import("./trendSignals");
    expect(isViralFor(false, { views: 15_000, multiplier: 1 })).toBe(true);
    expect(isViralFor(false, { views: 9_000, multiplier: 6 })).toBe(false);
    expect(isViralFor(true, { views: 9_000, multiplier: 6 })).toBe(true);
    expect(isViralFor(true, { views: 9_000, multiplier: 4.9 })).toBe(false);
    expect(isViralFor(true, { views: 4_000, multiplier: 20 })).toBe(false);
    expect(isViralFor(true, { views: 20_000, multiplier: null })).toBe(true);
  });
});

describe("reading 30 posts", () => {
  it("reads a 12-post row again only when the account has more posts", async () => {
    const { shortRead, POSTS_READ } = await import("./igCompetitorData");
    expect(POSTS_READ).toBe(30);
    expect(shortRead(new Array(12).fill({}), 161)).toBe(true);
    expect(shortRead(new Array(12).fill({}), 12)).toBe(false);
    expect(shortRead(new Array(30).fill({}), 161)).toBe(false);
    expect(shortRead(null, 161)).toBe(false);
  });
});
