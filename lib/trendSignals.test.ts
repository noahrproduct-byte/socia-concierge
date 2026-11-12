import { describe, expect, it } from "vitest";
import { hookLine, hookStructures, rankTrendingReels, trendSignals, trendsEvidence, type TrendingReel, type TrendAccount } from "./trendSignals";

const now = new Date("2026-11-04T12:00:00Z");
const day = (n: number) => new Date(now.getTime() - n * 86400000).toISOString();

const reel = (over: Partial<TrendingReel>): TrendingReel => ({
  url: `https://instagram.com/reel/${Math.random().toString(36).slice(2)}`, platform: "instagram", accountName: "A", accountHandle: "a",
  accountAvatar: null, title: null, thumb: null, publishedAt: day(3), views: 1000, likes: 10, comments: 1,
  multiplier: 1, basis: "views", format: "Reel", ...over,
});

describe("hookLine", () => {
  it("takes the first line without hashtags, mentions, links or leading emoji", () => {
    expect(hookLine("🔥🔥 POV: you finally found the best slice in town. Come by @salvos #pizza\nmore text")).toBe("POV: you finally found the best slice in town.");
  });
  it("drops lines too short to be a hook", () => {
    expect(hookLine("#pizza #food")).toBeNull();
    expect(hookLine("so good")).toBeNull();
    expect(hookLine(null)).toBeNull();
  });
  it("caps long lines on a word boundary", () => {
    const l = hookLine("word ".repeat(60))!;
    expect(l.length).toBeLessThanOrEqual(118);
    expect(l.endsWith("…")).toBe(true);
  });
});

describe("hookStructures", () => {
  it("names hook families and opening questions, never style tags", () => {
    expect(hookStructures("POV: you ordered the biggest pizza")).toEqual(expect.arrayContaining(["POV", "Superlative"]));
    expect(hookStructures("Why does nobody talk about this?")).toContain("Question");
    expect(hookStructures("Fresh dough every morning here")).toEqual([]);
  });
});

describe("rankTrendingReels", () => {
  it("measures Instagram Reels against the account's own view median and drops old posts", () => {
    const acct: TrendAccount = {
      platform: "instagram", name: "Shop", handle: "shop", avatar: null,
      posts: [
        { url: "u1", title: "one", thumb: null, views: 100, likes: 1, comments: 0, publishedAt: day(2), format: "Reel", durationSec: null, multiplier: null },
        { url: "u2", title: "two", thumb: null, views: 200, likes: 1, comments: 0, publishedAt: day(5), format: "Reel", durationSec: null, multiplier: null },
        { url: "u3", title: "three", thumb: null, views: 1000, likes: 1, comments: 0, publishedAt: day(9), format: "Reel", durationSec: null, multiplier: null },
        { url: "old", title: "old", thumb: null, views: 5000, likes: 1, comments: 0, publishedAt: day(90), format: "Reel", durationSec: null, multiplier: null },
      ],
    };
    const out = rankTrendingReels([acct], [], now);
    expect(out.map((r) => r.url)).toEqual(["u3", "u2", "u1"]);
    // The baseline is every post read, old ones included: the median of 100, 200, 1000 and 5000 is 600.
    expect(out[0].multiplier).toBeCloseTo(1000 / 600);
    expect(out[0].basis).toBe("views");
  });
});

describe("trendSignals", () => {
  it("keeps a group only with 3 Reels from 2 accounts and marks it leading from a 1.3x median", () => {
    const reels = [
      reel({ accountHandle: "a", title: "POV: the first bite", multiplier: 2 }),
      reel({ accountHandle: "b", title: "POV: closing time on a Friday", multiplier: 1.6 }),
      reel({ accountHandle: "a", title: "POV: the dough finally rose", multiplier: 1.2 }),
      reel({ accountHandle: "c", title: "Why does nobody do this?", multiplier: 0.5 }),
      reel({ accountHandle: "c", title: "Why is this still a thing?", multiplier: 0.8 }),
    ];
    const s = trendSignals(reels);
    expect(s.reelsRead).toBe(5);
    expect(s.accounts).toBe(3);
    const pov = s.hooks.find((g) => g.label === "POV")!;
    expect(pov).toMatchObject({ posts: 3, accounts: 2, withBaseline: 3, aboveBaseline: 3, medianMultiplier: 1.6, leads: true });
    expect(pov.examples[0].line).toBe("POV: the first bite");
    expect(pov.examples[1].account).toBe("@b"); // a different account before a second from @a
    // Two questions from one account are an anecdote, not a pattern.
    expect(s.hooks.find((g) => g.label === "Question")).toBeUndefined();
    expect(s.strongLines.map((e) => e.line)).toEqual(["POV: the first bite", "POV: closing time on a Friday"]);
  });

  it("never claims a lead without baselines", () => {
    const reels = ["a", "b", "c"].map((h) => reel({ accountHandle: h, title: "POV: you walk in at noon", multiplier: null }));
    const g = trendSignals(reels).hooks.find((x) => x.label === "POV")!;
    expect(g.medianMultiplier).toBeNull();
    expect(g.leads).toBe(false);
  });
});

describe("trendsEvidence", () => {
  it("is empty without signals and labels other accounts' results", () => {
    expect(trendsEvidence(null)).toBe("");
    const s = trendSignals([
      reel({ accountHandle: "a", title: "POV: the first bite", multiplier: 2 }),
      reel({ accountHandle: "b", title: "POV: closing time on a Friday", multiplier: 1.6 }),
      reel({ accountHandle: "a", title: "POV: the dough finally rose", multiplier: 1.4 }),
    ]);
    const text = trendsEvidence(s);
    expect(text).toContain("other accounts' results, not a prediction for this one");
    expect(text).toContain("- POV: 3 Reels from 2 accounts, median 1.6x");
    expect(text).toContain("never reuse the wording");
    expect(text).not.toMatch(/—/);
  });
});
