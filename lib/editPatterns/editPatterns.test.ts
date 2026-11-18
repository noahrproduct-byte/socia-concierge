import { describe, it, expect } from "vitest";
import { studyPatterns } from "./seed";
import { scanPatterns } from "./fromScan";
import { relevantPatterns } from "./select";
import type { WatchedReel } from "@/lib/nicheScan/playbook";

const reel = (id: string, handle: string, over: Partial<WatchedReel> = {}): WatchedReel => ({
  id, url: `https://www.instagram.com/reel/${id}/`, platform: "instagram", account: handle, handle, thumb: null, caption: null, publishedAt: null,
  views: 1000, likes: 50, comments: 3, multiplier: 2.4, basis: "views vs this account's median", proven: true,
  format: "process", onScreenText: "send this to someone you'd eat this with", textSeen: true, hook: "wait for the cheese pull", cta: { kind: "send_to", text: null },
  textStyle: null, framing: null, read: "frames",
  editing: { durationSec: 12, measuredSec: 12, cuts: [2, 4, 6, 8], cutsPer10s: 3.3, medianShotSec: 2, firstCutSec: 2 },
  ...over,
});

describe("the editing pattern library", () => {
  it("starts with one study pattern per house genre, each with real study Reels and its limits", () => {
    const s = studyPatterns();
    expect(s.map((p) => p.category)).toEqual(expect.arrayContaining(["food_reel", "before_after_match", "saas_demo", "talking_head_reel", "sports_montage"]));
    const food = s.find((p) => p.category === "food_reel")!;
    expect(food.characteristics.lengthSec).toEqual([7, 14]);
    expect(food.evidence.length).toBeGreaterThan(0);
    expect(food.evidence.every((e) => e.url.startsWith("https://www.instagram.com/"))).toBe(true);
    expect(food.limitations.join(" ")).toMatch(/not against each creator's own usual/);
    expect(s.every((p) => p.confidence !== "high")).toBe(true);
  });

  it("makes a scan pattern only from formats that beat their usual across two accounts, with measured numbers", () => {
    const watched = [
      reel("a", "pizzaone"), reel("b", "pizzatwo", { editing: { durationSec: 9, measuredSec: 9, cuts: [3, 6], cutsPer10s: 2.2, medianShotSec: 3, firstCutSec: 3 } }), reel("c", "pizzathree"),
      reel("d", "pizzaone", { format: "pov" }), // one account only: not a pattern
      reel("e", "slowshop", { weak: true, proven: false, multiplier: 0.4, editing: { durationSec: 30, measuredSec: 30, cuts: [15], cutsPer10s: 0.3, medianShotSec: 15, firstCutSec: 15 } }),
      reel("f", "slowtwo", { weak: true, proven: false, multiplier: 0.5, editing: { durationSec: 28, measuredSec: 28, cuts: [], cutsPer10s: 0, medianShotSec: 28, firstCutSec: null } }),
    ];
    const ps = scanPatterns(watched, "Pizza restaurant", new Date("2026-11-17T00:00:00Z"));
    expect(ps.map((p) => p.key)).toEqual(["scan:process"]);
    const p = ps[0];
    expect(p.observed).toMatchObject({ reels: 3, accounts: 3, measured: 3 });
    expect(p.characteristics.cutsPer10s).toEqual([2.8, 3.3]);
    expect(p.characteristics.hooks).toEqual(["wait for the cheese pull"]);
    expect(p.characteristics.ctas).toEqual(["send this to someone"]);
    expect(p.characteristics.notes?.[0]).toMatch(/did worse than usual cut 0\.2 times per 10 s, against 3\.3/);
    expect(p.confidence).toBe("medium");
    expect(p.evidence[0].editing?.cutsPer10s).toBeDefined();
  });

  it("never makes a pattern from Reels that did worse than usual, or that it couldn't measure, says so", () => {
    expect(scanPatterns([reel("a", "x", { weak: true, proven: false, multiplier: 0.3 }), reel("b", "y", { weak: true, proven: false, multiplier: 0.2 })], "food")).toEqual([]);
    const unmeasured = scanPatterns([reel("a", "x", { editing: null }), reel("b", "y", { editing: null })], "food");
    expect(unmeasured[0].characteristics.cutsPer10s).toBeNull();
    expect(unmeasured[0].limitations[0]).toMatch(/videos could be read, so its rhythm isn't measured/);
    expect(unmeasured[0].confidence).toBe("low");
  });

  it("picks different patterns for a restaurant, a SaaS pitch and a fitness transformation", () => {
    const all = studyPatterns();
    const pick = (niche: string, words: string[]) => relevantPatterns(all, { niche, words }, 1)[0]?.category;
    expect(pick("Pizza restaurant", ["promo"])).toMatch(/food_reel|two_act_story/);
    expect(pick("SaaS software", ["pitch", "talking"])).toMatch(/saas_demo|talking_head_reel/);
    expect(pick("Fitness coaching", ["transformation", "before"])).toBe("before_after_match");
  });

  it("puts the brand's own measured niche pattern ahead of a study pattern for the same request", () => {
    const scan = scanPatterns([reel("a", "x"), reel("b", "y")], "Pizza restaurant");
    const top = relevantPatterns([...studyPatterns(), ...scan], { niche: "Pizza restaurant", category: "process" }, 2);
    expect(top[0].source).toBe("scan");
  });
});
