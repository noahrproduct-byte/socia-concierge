import { describe, expect, it } from "vitest";
import { nicheBaseline, nicheForecast, NICHE_PER_ACCOUNT } from "./outlook";

const ACCOUNTS = [
  { handle: "a", followers: 10_000, views: [2000, 4000, 6000, 8000, 10000] },
  { handle: "b", followers: 100_000, views: [20000, 40000, 60000, 80000, 100000] },
  { handle: "c", followers: 5_000, views: [1000, 2000, 3000, 4000, 5000] },
];

describe("estimated views from the niche", () => {
  it("needs enough Reels from enough accounts, ignores tiny accounts and caps each account", () => {
    expect(nicheBaseline(ACCOUNTS.slice(0, 2))).toBeNull();
    expect(nicheBaseline([...ACCOUNTS.slice(0, 2), { handle: "tiny", followers: 300, views: [100, 200, 300, 400, 500] }])).toBeNull();
    const b = nicheBaseline([...ACCOUNTS, { handle: "big", followers: 2_000_000, views: Array.from({ length: 40 }, () => 900_000) }])!;
    expect(b.reels).toBe(15 + NICHE_PER_ACCOUNT);
    expect(b.accounts).toBe(4);
  });

  it("fits how views grow with followers instead of scaling straight by followers", () => {
    // Views grow with the square root of followers here: 10K -> 1,000, 40K -> 2,000, 160K -> 4,000.
    const b = nicheBaseline([
      { handle: "s", followers: 10_000, views: [800, 1000, 1200, 900, 1100] },
      { handle: "m", followers: 40_000, views: [1600, 2000, 2400, 1800, 2200] },
      { handle: "l", followers: 160_000, views: [3200, 4000, 4800, 3600, 4400] },
    ])!;
    expect(b.growth).toBeCloseTo(0.5, 1);
    const tiny = nicheForecast(b, 35, 60)!;
    // A 35-follower account: about 1,000 x (35 / 10,000)^0.5 = 59 views, not 35 x 0.1 = 3.5 per follower scaling.
    expect(tiny.estimate).toBeGreaterThan(40);
    expect(tiny.estimate).toBeLessThan(90);
  });

  it("weighs a few of the account's own Reels in, and a stronger video lands higher", () => {
    const b = nicheBaseline(ACCOUNTS)!;
    const noOwn = nicheForecast(b, 35, 60)!;
    const withOwn = nicheForecast(b, 35, 60, [1500, 2200, 1800])!;
    expect(withOwn.own).toBe(3);
    expect(withOwn.estimate).toBeGreaterThan(noOwn.estimate);
    expect(nicheForecast(b, 35, 60, [1500])!.own).toBe(0);
    const ordinary = nicheForecast(b, 20_000, 60)!;
    expect(ordinary.low).toBeLessThan(ordinary.estimate);
    expect(ordinary.high).toBeGreaterThan(ordinary.estimate);
    expect(nicheForecast(b, 20_000, 85)!.estimate).toBeGreaterThan(ordinary.estimate);
    expect(nicheForecast(b, 20_000, 35)!.estimate).toBeLessThan(ordinary.estimate);
  });

  it("without the brand's followers, says what the niche's accounts get", () => {
    const f = nicheForecast(nicheBaseline(ACCOUNTS), null, 60)!;
    expect(f.basis).toBe("accounts");
    expect(f.medianFollowers).toBe(10_000);
  });

  it("gives nothing without a baseline or a video score", () => {
    expect(nicheForecast(null, 20_000, 60)).toBeNull();
    expect(nicheForecast(nicheBaseline(ACCOUNTS), 20_000, null)).toBeNull();
  });
});
