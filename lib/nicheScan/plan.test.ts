import { describe, expect, it } from "vitest";
import { initialState, mergeReels, nextBatch, nextPhase, pickReels, progressView, readState, READ_CAP, SCAN_SIZES, stepFits, STEP_MS, WEAK_AT } from "./plan";
import type { TrendingReel } from "../trendSignals";

const NOW = new Date("2026-11-12T12:00:00Z");
const reel = (i: number, account: string, multiplier: number | null, views: number | null = null): TrendingReel => ({
  url: `https://www.instagram.com/reel/${account}${i}/`, platform: "instagram", accountName: account, accountHandle: account, accountAvatar: null,
  title: `caption ${i}\nmore`, thumb: `https://scontent.cdninstagram.com/${i}.jpg`, publishedAt: "2026-11-01T10:00:00Z",
  views, likes: 100, comments: 5, multiplier, basis: "likes and comments", format: "Reel",
});

describe("niche scan phases", () => {
  it("start at discovery with honest zero counts", () => {
    const s = initialState("full", "pizza restaurant", NOW);
    expect(s.phase).toBe("discover");
    expect(Object.values(s.counts).every((n) => n === 0)).toBe(true);
    expect(readState(s)).toBe(s);
    expect(readState({ v: 2 })).toBeNull();
  });
  it("only start a step that fits in the time left", () => {
    expect(stepFits("discover", STEP_MS.discover)).toBe(true);
    expect(stepFits("discover", STEP_MS.discover - 1)).toBe(false);
    expect(stepFits("watch", 60_000)).toBe(true);
    expect(stepFits("done", 1e9)).toBe(false);
    expect(nextPhase("pick")).toBe("watch");
    expect(nextPhase("done")).toBe("done");
  });
  it("keep one copy of each Reel, best first, captions trimmed, capped", () => {
    const a = [reel(1, "a", 1.2), reel(2, "a", 3)];
    const merged = mergeReels(a, [reel(2, "a", 3), reel(3, "b", null, 50_000)]);
    expect(merged.map((r) => r.url)).toEqual([a[1].url, a[0].url, reel(3, "b", null).url]);
    expect(merged[0].title).toBe("caption 2 more");
    expect(mergeReels([], Array.from({ length: 200 }, (_, i) => reel(i, `x${i}`, i / 10)))).toHaveLength(READ_CAP);
  });
});

describe("picking what to study", () => {
  const reels = [
    reel(1, "a", 4), reel(2, "a", 3.5), reel(3, "a", 3), reel(4, "a", 2.5),
    reel(5, "b", 2), reel(6, "c", 1.6), reel(7, "d", 1.1), reel(8, "e", 0.9),
    reel(9, "f", 0.3), reel(10, "g", 0.4), reel(11, "f", 0.2), reel(12, "f", 0.1),
  ];
  it("takes the ones that took off, at most three from one account, then the weak ones", () => {
    const picked = pickReels(reels, "full");
    const good = picked.filter((p) => !p.weak);
    expect(good.filter((p) => p.account === "a")).toHaveLength(3);
    expect(good.slice(0, 5).every((p) => p.proven)).toBe(true);
    const weak = picked.filter((p) => p.weak);
    expect(weak.length).toBeGreaterThan(0);
    expect(weak.every((w) => (w.multiplier ?? 1) <= WEAK_AT)).toBe(true);
    // At most two weak ones from one account.
    expect(weak.filter((w) => w.account === "f").length).toBeLessThanOrEqual(2);
    // Ids are unique and in order.
    expect(picked.map((p) => p.id)).toEqual(picked.map((_, i) => `R${i + 1}`));
  });
  it("studies fewer on the small scan", () => {
    expect(pickReels(reels, "lite").filter((p) => !p.weak).length).toBeLessThanOrEqual(SCAN_SIZES.lite.watch);
    expect(pickReels([], "full")).toEqual([]);
  });
  it("hands out batches of what hasn't been studied", () => {
    const s = { ...initialState("full", null, NOW), picked: pickReels(reels, "full") };
    const first = nextBatch(s);
    expect(first).toHaveLength(SCAN_SIZES.full.batch);
    const watched = Object.fromEntries(first.map((r) => [r.id, r]));
    expect(nextBatch({ ...s, watched }).map((r) => r.id)).not.toContain(first[0].id);
  });
});

describe("what the card shows", () => {
  it("shows each phase with the real count it reached, never a guess", () => {
    const s = initialState("full", "pizza", NOW);
    s.phase = "watch";
    s.counts = { accounts: 14, accountsRead: 11, reelsRead: 96, proven: 18, toWatch: 24, watched: 8, patterns: 0 };
    const v = progressView(s, "running", s.startedAt);
    expect(v.steps.map((x) => x.state)).toEqual(["done", "done", "done", "active", "waiting"]);
    expect(v.steps[1].detail).toBe("96 Reels read from 11 accounts");
    expect(v.steps[3].detail).toBe("8 of 24 studied");
    expect(v.steps[4].detail).toBeNull();
  });
  it("marks nothing active when the run failed, and everything done when finished", () => {
    const s = initialState("lite", null, NOW);
    expect(progressView(s, "failed", null).steps.some((x) => x.state === "active")).toBe(false);
    s.phase = "done";
    s.counts.patterns = 1;
    const v = progressView(s, "done", null);
    expect(v.steps.every((x) => x.state === "done")).toBe(true);
    expect(v.steps[4].detail).toBe("1 pattern kept");
  });
});
