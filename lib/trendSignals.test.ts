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

describe("proven Reels", () => {
  const reels = [
    reel({ url: "https://instagram.com/reel/a1", accountHandle: "a", multiplier: 6, views: 240000, title: "POV: you walk in and the pizza is ready" }),
    reel({ url: "https://instagram.com/reel/a2", accountHandle: "a", multiplier: 3 }),
    reel({ url: "https://instagram.com/reel/a3", accountHandle: "a", multiplier: 2 }),
    reel({ url: "https://instagram.com/reel/b1", accountHandle: "b", accountName: "B", multiplier: 1.2 }),
    reel({ url: "https://youtube.com/shorts/c1", platform: "youtube", accountHandle: "c", accountName: "C", multiplier: null, views: 500000, format: "Short" }),
    reel({ url: "https://youtube.com/shorts/c2", platform: "youtube", accountHandle: "c", accountName: "C", multiplier: null, views: 900, format: "Short" }),
  ];

  it("keeps the Reels that took off, best first, two an account", async () => {
    const { provenReels } = await import("./trendSignals");
    const out = provenReels(reels);
    expect(out.map((r) => [r.id, r.url.split("/").pop()])).toEqual([["R1", "a1"], ["R2", "a2"], ["R3", "c1"]]);
    expect(out.every((r) => r.proven)).toBe(true);
    expect(out[0].line).toBe("POV: you walk in and the pizza is ready");
    expect(out[0].structures).toContain("POV");
  });

  it("fills a thin niche with the best of the rest, marked as not proven", async () => {
    const { provenReels } = await import("./trendSignals");
    const out = provenReels(reels, { fill: true, max: 5 });
    expect(out.map((r) => r.proven)).toEqual([true, true, true, false, false]);
    expect(out[3].url).toContain("b1");
  });

  it("maps a cited id back to the Reel's own link and numbers, and nothing else", async () => {
    const { pickRef, provenReels, refLine } = await import("./trendSignals");
    const list = provenReels(reels);
    const ref = pickRef(" r1 ", list)!;
    expect(ref).toMatchObject({ url: "https://instagram.com/reel/a1", account: "@a", views: 240000, multiplier: 6, structure: "POV" });
    expect(refLine(ref)).toBe("@a on Instagram: 240K views, 6.0x their usual");
    expect(pickRef("R9", list)).toBeNull();
    expect(pickRef("", list)).toBeNull();
    expect(pickRef("https://evil.example", list)).toBeNull();
  });

  it("reads a stored reference back only when it is one", async () => {
    const { sanitizeRef } = await import("./trendSignals");
    expect(sanitizeRef({ url: "javascript:alert(1)", platform: "instagram", account: "@a" })).toBeNull();
    expect(sanitizeRef({ url: "https://instagram.com/reel/a1", platform: "instagram" })).toBeNull();
    expect(sanitizeRef({ url: "https://instagram.com/reel/a1", platform: "instagram", account: "@a", views: -4, multiplier: "9" }))
      .toEqual({ url: "https://instagram.com/reel/a1", platform: "instagram", account: "@a", title: null, views: null, likes: null, comments: null, multiplier: null, basis: "views", structure: null });
  });

  it("writes the evidence with ids, as other accounts' results and never a prediction", async () => {
    const { provenEvidence, provenReels } = await import("./trendSignals");
    const block = provenEvidence(provenReels(reels, { fill: true }));
    expect(block).toContain("not a prediction for this one");
    expect(block).toContain('- R1 | Instagram Reel by @a | opens: "POV: you walk in and the pizza is ready" | 240K views, 6.0x their usual | hook structure: POV');
    expect(block).not.toContain("b1");
    expect(block.split("\n").filter((l) => l.startsWith("- R"))).toHaveLength(3);
    expect(provenEvidence([])).toBe("");
  });
});

describe("viral track record", () => {
  it("counts the Reel, the Reels that open the same way and the Reels on its topic, and says what it counted", async () => {
    const { trackRecord, trackWord, sanitizeTrack } = await import("./trendSignals");
    const group = (label: string, kind: "hook" | "topic", above: number, of: number, med: number, leads: boolean) =>
      ({ label, kind, posts: of, accounts: 3, withBaseline: of, aboveBaseline: above, medianMultiplier: med, leads, examples: [] });
    const signals = { reelsRead: 20, accounts: 5, hooks: [group("POV", "hook", 4, 5, 2.1, true)], topics: [group("Kitchen / process", "topic", 2, 4, 1.1, false)], strongLines: [] };
    const t = trackRecord({ multiplier: 8, views: 240000, basis: "views", structures: ["POV"], topics: ["Kitchen / process"] }, signals);
    // 40 for the Reel at 8x; hook 20*4/5 + 10 = 26; topic 20*2/4 + 0 = 10.
    expect(t.parts.map((p) => [p.points, p.max])).toEqual([[40, 40], [26, 30], [10, 30]]);
    expect(t.score).toBe(76);
    expect(trackWord(t)).toBe("strong");
    expect(t.parts[1].basis).toBe("4 of 5 niche Reels with the same hook structure (POV) beat their creator's usual, worth 16 of 20. Their median is 2.1x, at or above 1.3x, worth 10 more.");
    expect(sanitizeTrack(JSON.parse(JSON.stringify(t)))).toEqual(t);
  });

  it("scores a part 0 and says why when too few Reels share it, and never rounds a thin sample up", async () => {
    const { trackRecord, trackWord, sanitizeTrack } = await import("./trendSignals");
    const empty = { reelsRead: 2, accounts: 1, hooks: [], topics: [], strongLines: [] };
    const t = trackRecord({ multiplier: 2, views: 900, basis: "likes and comments", structures: ["POV"], topics: [] }, empty);
    expect(t.parts.map((p) => p.points)).toEqual([13, 0, 0]);
    expect(t.parts[1].basis).toMatch(/^Fewer than 3 niche Reels from 2 accounts share its hook structure \(POV\)/);
    expect(t.parts[2].basis).toMatch(/found no topic it recognises/);
    expect(trackWord(t)).toBe("one Reel only");
    const noBase = trackRecord({ multiplier: null, views: 500000, basis: "views", structures: [], topics: [] }, empty);
    expect(noBase.score).toBe(15);
    expect(sanitizeTrack({ parts: [{ label: "x", points: 90, max: 40, basis: "b" }] })).toBeNull();
    expect(sanitizeTrack("76")).toBeNull();
  });
});
