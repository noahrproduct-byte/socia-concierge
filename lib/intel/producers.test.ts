import { describe, it, expect } from "vitest";
import { fromOverviewInsights, zeroViewDiagnostics, type RecentPost } from "./producers";
import { cleanDraft, confidenceFor, confidenceWord } from "./insight";
import type { Insight as OverviewInsight } from "../overview";

const NOW = new Date("2026-10-29T18:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const post = (over: Partial<RecentPost> = {}): RecentPost => ({ platform: "instagram", id: "m1", title: "Dough stretch", permalink: "https://instagram.com/p/x", publishedAt: hoursAgo(3), views: 0, format: "Reel", ...over });

describe("zeroViewDiagnostics", () => {
  it("flags a post reporting zero views two or more hours after publishing, with hypotheses, not causes", () => {
    const [d] = zeroViewDiagnostics([post()], NOW.toISOString(), NOW);
    expect(d.fingerprint).toBe("instagram:diagnostic:zero_views:m1");
    expect(d.category).toBe("diagnostic");
    expect(d.observation).toMatch(/reported 0 views for this reel 3 hours after/);
    expect(d.explanations.every((e) => e.type === "hypothesis")).toBe(true);
    expect(d.limitations.join(" ")).toMatch(/can't be confirmed/);
    expect(d.recommendation?.action).toMatch(/confirm it is public/);
  });

  it("stays quiet when the count is missing, too early, too old, or the data was read before two hours", () => {
    expect(zeroViewDiagnostics([post({ views: null })], NOW.toISOString(), NOW)).toEqual([]);
    expect(zeroViewDiagnostics([post({ publishedAt: hoursAgo(1) })], NOW.toISOString(), NOW)).toEqual([]);
    expect(zeroViewDiagnostics([post({ publishedAt: hoursAgo(100) })], NOW.toISOString(), NOW)).toEqual([]);
    expect(zeroViewDiagnostics([post()], hoursAgo(2), NOW)).toEqual([]);
    expect(zeroViewDiagnostics([post({ views: 12 })], NOW.toISOString(), NOW)).toEqual([]);
    expect(zeroViewDiagnostics([post()], null, NOW)).toEqual([]);
  });
});

describe("fromOverviewInsights", () => {
  const outlier: OverviewInsight = {
    id: "outlier", kind: "outlier", tone: "up", tag: "Breakout post", action: { label: "See why" },
    title: "One reel earned 5x your median interactions", body: "\"Dough stretch\": 500 against 100.",
    observed: ["\"Dough stretch\": 500 interactions", "Your median post: 100"], interpretation: "The hook or the subject may explain it.",
    recommendation: "Make a second post with the same opening.", postIds: ["m1"], planNote: "",
  };

  it("keeps the detector's words and labels its reading as a hypothesis, with a low confidence for one post", () => {
    const [d] = fromOverviewInsights([outlier], { handle: "salvos", syncedAt: NOW.toISOString(), postsById: new Map([["m1", { platform: "instagram", id: "m1", title: "Dough stretch", permalink: null }]]) });
    expect(d.fingerprint).toBe("instagram:overview:outlier:m1");
    expect(d.explanations).toEqual([{ type: "hypothesis", text: "The hook or the subject may explain it." }]);
    expect(d.confidence).toBe(confidenceFor(1));
    expect(d.posts).toHaveLength(1);
    expect(d.source.data).toEqual(outlier.observed);
    expect(d.limitations.join(" ")).toMatch(/lifetime totals/);
  });
});

describe("insight rules", () => {
  it("raises confidence with sample size and caps it on stale data", () => {
    expect([1, 3, 6, 10, 20].map((n) => confidenceFor(n))).toEqual([35, 45, 60, 70, 80]);
    expect(confidenceFor(20, { stale: true })).toBe(40);
    expect(confidenceWord(80)).toBe("Strong pattern");
    expect(confidenceWord(40)).toBe("Early lead");
  });

  it("refuses a draft without a title or observation and bounds the rest", () => {
    const [d] = zeroViewDiagnostics([post()], NOW.toISOString(), NOW);
    expect(cleanDraft({ ...d, title: "" })).toBeNull();
    expect(cleanDraft({ ...d, confidence: 400 })?.confidence).toBe(100);
    expect(cleanDraft({ ...d, explanations: [{ type: "cause" as never, text: "x" }] })?.explanations).toEqual([]);
  });
});
