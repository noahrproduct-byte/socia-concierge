import { describe, it, expect } from "vitest";
import {
  BASELINE_MIN, BACKTEST_MIN, SETTLE_DAYS, STRONG_VIDEO, backtest, buildModel, chanceOfAtLeast, estimate, outlookFor, patternLine, quantile, rankAgreement, strengthAfter, videoStrength,
  recordCheck, recordOf, reelsFrom, roundViews, sanitizeRecord, traitsOf, type OutlookReel,
} from "./outlook";

const DAY = 86_400_000;
const NOW = new Date("2026-11-05T12:00:00.000Z");
/** A Reel posted `daysAgo` days before NOW. */
const reel = (daysAgo: number, views: number, traits: string[] = []): OutlookReel => ({ at: new Date(NOW.getTime() - daysAgo * DAY).toISOString(), views, traits });
/** n Reels, one every `gap` days, oldest first, the newest `start` days old. */
const run = (n: number, f: (i: number) => { views: number; traits?: string[] }, gap = 4, start = 10): OutlookReel[] =>
  Array.from({ length: n }, (_, i) => { const x = f(i); return reel(start + (n - 1 - i) * gap, x.views, x.traits ?? []); });

describe("what a caption shows before it is posted", () => {
  it("reads the opening, the subject and the length; an empty caption has nothing", () => {
    expect(traitsOf("")).toEqual([]);
    expect(traitsOf("Why does your dough tear?")).toEqual(expect.arrayContaining(["open:Question", "caption:short"]));
    expect(traitsOf(`How we make the sauce, step by step. ${"More about it. ".repeat(12)}`)).toEqual(expect.arrayContaining(["theme:Tutorial", "caption:long"]));
  });
  it("does not count hashtags toward the length", () => {
    expect(traitsOf(`New special this week ${"#pizza ".repeat(30)}`)).toContain("caption:short");
  });
});

describe("the account's comparable Reels", () => {
  const item = (daysAgo: number, extra: object = {}) => ({ media_product_type: "REELS", timestamp: new Date(NOW.getTime() - daysAgo * DAY).toISOString(), caption: "A Reel", insights: { views: 900 }, ...extra });
  it("keeps settled Reels with a reported view count, oldest first, and counts the ones still settling", () => {
    const { reels, pending } = reelsFrom([item(1), item(20), item(9), item(SETTLE_DAYS - 0.5)], NOW);
    expect(reels.map((r) => Math.round((NOW.getTime() - Date.parse(r.at)) / DAY))).toEqual([20, 9]);
    expect(pending).toBe(2);
  });
  it("leaves out photos, collab posts from another account, and Reels with no view count (never read as zero)", () => {
    const { reels } = reelsFrom([item(20, { media_product_type: "FEED", media_type: "IMAGE" }), item(20, { collab_owner: "other" }), item(20, { insights: {} }), item(20, { insights: { views: 0 } })], NOW);
    expect(reels).toEqual([]);
  });
});

describe("the baseline", () => {
  it("says nothing with too little history", () => {
    expect(buildModel([], 0).state).toBe("none");
    const thin = buildModel(run(BASELINE_MIN - 1, () => ({ views: 1000 })), 2);
    expect(thin.state).toBe("thin");
    expect(thin.baseline).toBeNull();
    expect(outlookFor(thin, "Why?").forecast).toBeNull();
  });
  it("is the median and the middle half of the last 30 settled Reels", () => {
    const m = buildModel(run(40, (i) => ({ views: i < 10 ? 1_000_000 : 100 * (i - 9) })), 0);
    expect(m.baseline).toMatchObject({ n: 30, median: 1550 });
    expect(m.baseline!.low).toBeCloseTo(quantile(Array.from({ length: 30 }, (_, i) => 100 * (i + 1)), 0.25));
    expect(m.baseline!.high).toBeGreaterThan(m.baseline!.median);
  });
  it("compares the most recent Reels with the ones before, only when there are enough before", () => {
    expect(buildModel(run(12, () => ({ views: 500 })), 0).momentum).toBeNull();
    const up = buildModel(run(20, (i) => ({ views: i >= 12 ? 3000 : 1000 })), 0).momentum!;
    expect(up).toMatchObject({ recentN: 8, earlierN: 12, recentMedian: 3000, earlierMedian: 1000, word: "above" });
    expect(buildModel(run(20, (i) => ({ views: i >= 12 ? 1100 : 1000 })), 0).momentum!.word).toBe("level");
  });
});

describe("patterns", () => {
  it("needs three Reels on each side, and carries both samples", () => {
    const m = buildModel(run(12, (i) => ({ views: i % 3 === 0 ? 4000 : 1000, traits: [i % 3 === 0 ? "open:Question" : "x", ...(i < 2 ? ["theme:Tutorial"] : [])] })), 0);
    const q = m.patterns.find((p) => p.key === "open:Question")!;
    expect(q).toMatchObject({ withN: 4, withMedian: 4000, withoutN: 8, withoutMedian: 1000, ratio: 4 });
    expect(m.patterns.find((p) => p.key === "theme:Tutorial")).toBeUndefined();
    expect(patternLine(q)).toBe("Your 4 Reels where the caption opens with a question have a median of 4,000 views, against 1,000 for the other 8.");
  });
});

describe("the estimate", () => {
  it("is null without a baseline, and never promises more than double or less than half the median", () => {
    expect(estimate(run(BASELINE_MIN - 1, () => ({ views: 1000 })), [])).toBeNull();
    const h = run(12, (i) => ({ views: i % 2 ? 100_000 : 1000, traits: i % 2 ? ["a", "b", "c"] : [] }));
    const med = quantile(h.map((r) => r.views), 0.5);
    expect(estimate(h, ["a", "b", "c"])!).toBeLessThanOrEqual(med * 2 + 1e-6);
    expect(estimate(run(12, (i) => ({ views: i % 2 ? 10 : 1000, traits: i % 2 ? ["a", "b", "c"] : [] })), ["a", "b", "c"])!).toBeGreaterThanOrEqual(1000 * 0.5 * 0.5);
  });
  it("is the plain median when the draft shares nothing and there is no momentum to read", () => {
    expect(estimate(run(10, (i) => ({ views: 1000 + i })), ["never-seen"])).toBeCloseTo(1004.5);
  });
});

describe("the replay that decides how much to trust the score", () => {
  it("forecasts each Reel only from Reels that had already settled when it went out", () => {
    // Posted daily: the two Reels before each are still settling, so they can't inform it.
    expect(backtest(run(BASELINE_MIN + 6, () => ({ views: 1000 }), 1))!.n).toBe(4);
    // Every 4 days: all the Reels before each have settled.
    expect(backtest(run(BASELINE_MIN + 6, () => ({ views: 1000 }), 4))!.n).toBe(6);
  });
  it("is low confidence when there are too few replays, with the count in the reason", () => {
    const m = buildModel(run(BASELINE_MIN + 5, (i) => ({ views: 900 + (i % 5) * 60 })), 0);
    expect(m.backtest!.passes).toBe(false);
    expect(m.backtest!.why).toMatch(new RegExp(`needs ${BACKTEST_MIN}`));
    const f = outlookFor(m, "Why does it tear?").forecast!;
    expect(f.checked).toBe(false);
    expect(f.low).toBeLessThanOrEqual(f.estimate);
    expect(f.high).toBeGreaterThanOrEqual(f.estimate);
  });
  it("is low confidence when the patterns are noise: the model must beat the plain median to be checked", () => {
    // Views vary on a cycle of five, the trait alternates: both sides of it see the same views.
    const noise = [1200, 400, 2600, 800, 1500];
    const m = buildModel(run(40, (i) => ({ views: noise[i % 5], traits: [i % 2 ? "open:Question" : "y"] })), 0);
    expect(m.backtest!.n).toBeGreaterThanOrEqual(BACKTEST_MIN);
    expect(m.backtest!.passes).toBe(false);
    const f = outlookFor(m, "Is this the best slice in town?").forecast!;
    expect(f.checked).toBe(false);
    expect(f.index).toBeGreaterThanOrEqual(0);
    expect(f.index).toBeLessThanOrEqual(100);
  });
  it("is checked when a real pattern makes it beat the median, and a different caption moves it", () => {
    const wobble = [0.6, 0.8, 1, 1.3, 1.7];
    const m = buildModel(run(44, (i) => ({ views: Math.round((i % 2 ? 4000 : 1000) * wobble[i % 5]), traits: [i % 2 ? "open:Question" : "y", "caption:short"] })), 0);
    expect(m.backtest!.passes).toBe(true);
    expect(m.backtest!.modelError).toBeLessThan(m.backtest!.medianError);
    expect(chanceOfAtLeast(m.backtest!.closer, m.backtest!.differed)).toBeLessThanOrEqual(0.05);
    const withQ = outlookFor(m, "Is this the best slice in town?").forecast!;
    const without = outlookFor(m, "The best slice in town.").forecast!;
    expect(withQ.checked).toBe(true);
    expect(withQ.low).toBeLessThan(withQ.estimate);
    expect(withQ.high).toBeGreaterThan(withQ.estimate);
    expect(withQ.index).toBeGreaterThan(50);
    expect(withQ.index).toBeLessThanOrEqual(100);
    expect(withQ.estimate).toBeGreaterThan(without.estimate);
    expect(outlookFor(m, "Is this the best slice in town?").shared[0].key).toBe("open:Question");
  });
});

describe("numbers", () => {
  it("knows how often chance alone gets k of n right", () => {
    expect(chanceOfAtLeast(0, 10)).toBe(1);
    expect(chanceOfAtLeast(10, 10)).toBeCloseTo(1 / 1024);
    expect(chanceOfAtLeast(15, 20)).toBeCloseTo(0.0207, 3);
  });
  it("rounds an estimate to two significant figures", () => {
    expect([roundViews(3449), roundViews(87), roundViews(124_999), roundViews(0)]).toEqual([3400, 87, 120_000, 0]);
  });
  it("measures rank agreement, and has none when a list has no spread", () => {
    expect(rankAgreement([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
    expect(rankAgreement([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1);
    expect(rankAgreement([5, 5, 5, 5], [1, 2, 3, 4])).toBeNull();
  });
});

describe("what is kept with a post", () => {
  const m = buildModel(run(12, (i) => ({ views: 1000 + i * 100 })), 0);
  it("keeps the prediction stated before posting, and nothing without a baseline", () => {
    expect(recordOf(buildModel([], 0), null)).toBeNull();
    expect(recordOf(m, outlookFor(m, "A caption"))).toMatchObject({ kind: "forecast", n: 12 });
    const r = recordOf(m, { shared: [], forecast: null })!;
    expect(r).toMatchObject({ kind: "usual", n: 12, index: null });
    expect(r.low).toBeLessThan(r.high);
    expect(sanitizeRecord(JSON.parse(JSON.stringify(r)))).toEqual(r);
  });
  it("rejects a record that isn't one", () => {
    expect(sanitizeRecord({ kind: "forecast", n: 3, median: 1, low: 1, high: 2 })).toBeNull();
    expect(sanitizeRecord({ kind: "usual", n: 12, median: 1000, low: 2000, high: 100 })).toBeNull();
    expect(sanitizeRecord({ kind: "forecast", n: 12, median: 1000, low: 800, high: 2000 })!.kind).toBe("usual");
  });
  it("reads the result against it, and says so while the number is still moving", () => {
    const r = { kind: "forecast" as const, n: 20, median: 2000, low: 1100, high: 3400, index: 61 };
    expect(recordCheck(r, 2900, false)).toBe("SOCIA's range for it was 1,100 to 3,400 views. It has 2,900: inside the range.");
    expect(recordCheck({ ...r, kind: "usual", index: null }, 400, true)).toBe("Your usual range then was 1,100 to 3,400 views. It has 400 so far: below the range, and the number is still moving.");
    expect(recordCheck(r, 9000, false)).toMatch(/above the range\.$/);
  });
});

describe("reading the video itself", () => {
  const parts = (n: number) => ["hook", "structure", "pacing", "clarity", "visual", "captions", "audio", "cta", "goal"].map((id) => ({ id, score: id === "cta" || id === "goal" ? 10 : n }));
  const m = buildModel(run(30, (i) => ({ views: 200 + i * 100 })), 0);
  it("ignores the ask and brand fit, and needs enough of the video to judge", () => {
    expect(videoStrength(parts(80))).toBeCloseTo(80);
    expect(videoStrength([{ id: "hook", score: 90 }, { id: "audio", score: 90 }])).toBeNull();
    expect(videoStrength([{ id: "hook", score: 80 }, { id: "visual", score: null }, { id: "clarity", score: 60 }, { id: "pacing", score: 60 }])).toBeCloseTo(70);
  });
  it("gives a stronger video a higher score and more predicted views, on the same account and caption", () => {
    const weak = outlookFor(m, "A caption", 40).forecast!;
    const usual = outlookFor(m, "A caption", 60).forecast!;
    const strong = outlookFor(m, "A caption", 90).forecast!;
    expect(strong.index).toBeGreaterThan(usual.index);
    expect(usual.index).toBeGreaterThan(weak.index);
    expect(strong.estimate).toBeGreaterThan(usual.estimate);
    expect(usual.estimate).toBeGreaterThan(weak.estimate);
  });
  it("is always low confidence, because how strength maps to views isn't proven yet", () => {
    const f = outlookFor(m, "A caption", 90).forecast!;
    expect(f).toMatchObject({ video: true, checked: false });
    expect(outlookFor(m, "A caption").forecast!.video).toBe(false);
  });
  it("reaches the account's best Reel once the video is strong", () => {
    expect(outlookFor(m, "A caption", STRONG_VIDEO).forecast!.high).toBeGreaterThanOrEqual(roundViews(200 + 29 * 100));
  });
  it("recalculates after the edits from each part's estimated score, not by adding points", () => {
    const cats = parts(50);
    const before = videoStrength(cats)!;
    const after = strengthAfter(cats, [{ part: "hook", scoreAfter: 90 }, { part: "hook", scoreAfter: 70 }, { part: "cta", scoreAfter: 80 }]);
    expect(after).toBeCloseTo(before + 0.3 * 40);
    expect(strengthAfter([{ id: "hook", score: null }, ...cats.slice(1)], [{ part: "hook", scoreAfter: 90 }])).toBeCloseTo(50);
  });
});
