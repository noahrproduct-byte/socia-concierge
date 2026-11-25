import { describe, expect, it } from "vitest";
import { growth30, keyOf, rankAccounts, rankOne, type RankInput } from "./rank";

const base: RankInput = { platform: "instagram", handle: "a", fit: null, followers: null, medianViews: null, engagement: null, postsPerWeek: null, breakouts: 0, sameStyle: false, growth30: null, local: null, pinned: false };
const brand = { followers: 3000, servesLocally: false };

describe("rankAccounts", () => {
  it("a business like yours that people watch beats a bigger account that's only in the niche", () => {
    const like = { ...base, handle: "like", fit: "competitor" as const, followers: 4000, medianViews: 20_000, postsPerWeek: 3 };
    const big = { ...base, handle: "big", fit: "niche" as const, followers: 2_000_000, medianViews: 30_000, postsPerWeek: 3 };
    expect(rankAccounts([big, like], brand).map((r) => r.key)).toEqual(["instagram:like", "instagram:big"]);
  });

  it("doesn't rank on follower count alone: a small account reaching far past its size can lead", () => {
    const small = { ...base, handle: "small", fit: "niche" as const, followers: 2000, medianViews: 80_000, breakouts: 2 };
    const giant = { ...base, handle: "giant", fit: "niche" as const, followers: 5_000_000, medianViews: 40_000 };
    expect(rankAccounts([giant, small], brand)[0].key).toBe("instagram:small");
  });

  it("the person's priority accounts always come first, and say so", () => {
    const strong = { ...base, handle: "strong", fit: "competitor" as const, medianViews: 500_000, sameStyle: true };
    const pinned = { ...base, handle: "mine", pinned: true };
    const r = rankAccounts([strong, pinned], brand);
    expect(r[0].key).toBe("instagram:mine");
    expect(r[0].reasons[0]).toBe("Your priority");
  });

  it("growth, size, the brand's city and a matching style all count, with reasons in plain words", () => {
    const r = rankOne({ ...base, fit: "competitor", followers: 2500, growth30: 0.08, local: true, sameStyle: true, medianViews: 4000 }, { followers: 3000, servesLocally: true });
    expect(r.reasons).toEqual(["A business like yours", "About your size", "In your city", "Followers up 8% in 30 days"]);
    expect(r.parts.growth).toBeCloseTo(0.8);
    expect(rankOne({ ...base, followers: 2500, local: true }, { followers: 3000, servesLocally: false }).reasons).not.toContain("In your city");
  });

  it("missing numbers add nothing and are never guessed", () => {
    const r = rankOne(base, brand);
    expect(r.parts).toEqual({ business: 0.4, audience: 0, growth: 0, performance: 0, practical: 0 });
    expect(r.reasons).toEqual([]);
  });

  it("ties keep the order given", () => {
    expect(rankAccounts([{ ...base, handle: "x" }, { ...base, handle: "y" }], brand).map((r) => r.key)).toEqual(["instagram:x", "instagram:y"]);
  });

  it("keys ignore @ and case", () => {
    expect(keyOf("instagram", "@SaLvo")).toBe("instagram:salvo");
  });
});

describe("growth30", () => {
  const now = new Date("2026-11-25T00:00:00Z");
  it("needs three weeks of history, then gives the change", () => {
    expect(growth30([{ day: "2026-10-27", followers: 1000 }, { day: "2026-11-24", followers: 1100 }], now)).toBeCloseTo(0.1);
    expect(growth30([{ day: "2026-11-15", followers: 1000 }, { day: "2026-11-24", followers: 1100 }], now)).toBeNull();
    expect(growth30([{ day: "2026-10-27", followers: null }, { day: "2026-11-24", followers: 1100 }], now)).toBeNull();
  });
});
