import { describe, it, expect } from "vitest";
import { MIN_FIT, cheapPass, fitInput, judgmentsFrom, narrowWorld, rankTrending, sanitizeTrendFit, toJudge, trendScore, withJudgments } from "./trendFit";
import { ADDS_PER_READ, chooseTopUp, openAutoSlots, qualifies, topUpReason, topUpScore, type TopUpCandidate } from "./competitorTopUp";
import { reelFacts } from "./discoverAdapt";
import type { FeedReel } from "./discoverFeed";

const NOW = new Date("2026-11-24T12:00:00Z");
let n = 0;
const reel = (title: string, extra: Partial<FeedReel> = {}): FeedReel => ({
  url: `https://www.instagram.com/reel/FIT${n++}abc/`, platform: "instagram", accountName: "acct", accountHandle: `acct${n}`, accountAvatar: null,
  title, thumb: null, publishedAt: "2026-11-20T00:00:00Z", views: 200000, likes: 1, comments: 1, multiplier: 4, basis: "views", format: "Reel",
  id: "T1", proven: true, line: null, structures: [], topics: [], source: "trending", ...extra,
} as FeedReel);
const pizza = ["What the account is: Neapolitan pizza restaurant in Nashville", "Niche: Pizza restaurant"];

describe("Trending: what a business could adapt", () => {
  it("drops Reels from narrow worlds the business isn't in, before any AI", () => {
    const gta = reel("GTA 6 money glitch tutorial");
    const code = reel("Build a React app in 5 minutes");
    const reveal = reel("Three outfits, three moods");
    expect(narrowWorld(gta)).toBe("gaming");
    expect(cheapPass([gta, code, reveal], pizza)).toEqual([reveal]);
    expect(cheapPass([code], ["Niche: Software, a SaaS app for coaches"])).toEqual([code]);
  });
  it("ranks judged Reels by adaptability first, and no view count buys past the minimum", () => {
    const viralButUseless = reel("Huge but irrelevant", { views: 9_000_000, multiplier: 40 });
    const modestButAdaptable = reel("Three outfits, three moods", { views: 20000, multiplier: 1.5 });
    const store = withJudgments(null, "p1", {
      [viralButUseless.url.split("/reel/")[1].replace("/", "")]: { fit: MIN_FIT - 1, structure: "", at: NOW.toISOString() },
      [modestButAdaptable.url.split("/reel/")[1].replace("/", "")]: { fit: 88, structure: "Three-option reveal with quick cuts", at: NOW.toISOString() },
    });
    const out = rankTrending([viralButUseless, modestButAdaptable], pizza, store, "p1", NOW);
    expect(out.judged).toBe(true);
    expect(out.reels.map((r) => r.title)).toEqual(["Three outfits, three moods"]);
    expect(out.reels[0].fitStructure).toBe("Three-option reveal with quick cuts");
    // At the same performance, adaptability decides; it carries half the weight.
    expect(trendScore(90, modestButAdaptable, NOW)).toBeGreaterThan(trendScore(50, modestButAdaptable, NOW));
    expect(trendScore(90, modestButAdaptable, NOW) - trendScore(50, modestButAdaptable, NOW)).toBeCloseTo(0.2);
  });
  it("keeps showing the first pass until anything is judged, and judges only what's new for the profile", () => {
    const a = reel("A"), b = reel("B");
    expect(rankTrending([a, b], pizza, null, "p1", NOW)).toMatchObject({ judged: false, waiting: 2 });
    const store = withJudgments(null, "p1", { [a.url.split("/reel/")[1].replace("/", "")]: { fit: 70, structure: "x", at: NOW.toISOString() } });
    expect(toJudge([a, b], pizza, store, "p1", NOW).map((r) => r.title)).toEqual(["B"]);
    expect(toJudge([a, b], pizza, store, "p2", NOW)).toHaveLength(2);
  });
  it("reads the model's judgments by id and keeps them bounded", () => {
    const list = [reel("A"), reel("B")];
    const got = judgmentsFrom({ reels: [{ id: "T2", fit: 140, structure: "Before — after" }, { id: "T9", fit: 50, structure: "x" }] }, list, NOW);
    expect(Object.values(got)).toEqual([{ fit: 100, structure: "Before, after", at: NOW.toISOString() }]);
    expect(sanitizeTrendFit({ profile: "p", reels: { "bad key!": { fit: 1, at: NOW.toISOString() } } })!.reels).toEqual({});
    expect(fitInput(pizza, "Filmed footage", list)).toContain("T1: @acct");
  });
  it("hands the transferable structure to the adaptation", () => {
    expect(reelFacts({ ...reel("Three outfits"), fitStructure: "Three-option reveal" }, false)).toContain("SOCIA judged transfers to this business: Three-option reveal");
  });
});

describe("SOCIA's own competitor picks", () => {
  it("adds about as many as the person added, within 30 and the plan's limit", () => {
    expect(openAutoSlots(2, 0, 30)).toBe(2);
    expect(openAutoSlots(5, 0, 30)).toBe(5);
    expect(openAutoSlots(15, 0, 30)).toBe(15);
    expect(openAutoSlots(20, 0, 30)).toBe(10);
    expect(openAutoSlots(10, 4, 30)).toBe(6);
    expect(openAutoSlots(2, 0, 5)).toBe(2);
    expect(openAutoSlots(4, 0, 5)).toBe(1);
    expect(openAutoSlots(5, 0, 5)).toBe(0);
    expect(openAutoSlots(0, 0, 30)).toBe(0);
  });
  const c = (handle: string, extra: Partial<TopUpCandidate> = {}): TopUpCandidate => ({
    handle, name: handle, fit: "competitor", followers: 20000, medianViews: 8000, engagement: 0.03, postsPerWeek: 3, recentReels: 6, breakouts: 1, sameStyle: false, ...extra,
  });
  it("never adds an account below the bar, however many places are open", () => {
    expect(qualifies(c("ok"))).toBe(true);
    expect(qualifies(c("off", { fit: "off" }))).toBe(false);
    expect(qualifies(c("tiny", { followers: 400 }))).toBe(false);
    expect(qualifies(c("quiet", { recentReels: 1 }))).toBe(false);
    expect(qualifies(c("unwatched", { medianViews: 200, engagement: 0.002 }))).toBe(false);
    expect(qualifies(c("creator", { fit: "niche", app: true }))).toBe(false);
    expect(chooseTopUp([c("tiny", { followers: 10 })], 5, new Set())).toEqual([]);
  });
  it("skips removed and tracked accounts, ranks big and outperforming accounts, adds a few per read", () => {
    const big = c("bigpizza", { followers: 900000, medianViews: 300000 });
    const small = c("smallbutstrong", { followers: 3000, medianViews: 40000, breakouts: 3 });
    const plain = c("plain", { followers: 50000, medianViews: 2000, breakouts: 0, postsPerWeek: 0.5 });
    const picks = chooseTopUp([plain, small, big, c("removed")], 10, new Set(["removed"]));
    expect(picks.map((p) => p.handle).slice(0, 2).sort()).toEqual(["bigpizza", "smallbutstrong"]);
    expect(picks[2].handle).toBe("plain");
    expect(topUpScore(small)).toBeGreaterThan(topUpScore(plain));
    expect(chooseTopUp(Array.from({ length: 12 }, (_, i) => c(`a${i}`)), 12, new Set())).toHaveLength(ADDS_PER_READ);
    expect(topUpReason(big)).toBe("A business like yours, 900K followers, Reels usually reach 300K views, 1 Reel at 3x its usual or more, posts 3.0 a week.");
  });
});
