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

  it("scales the niche's views per follower to the brand's followers, and a stronger video lands higher", () => {
    const b = nicheBaseline(ACCOUNTS)!;
    // Every Reel here is 0.2 to 1.0 views per follower, so for 20,000 followers an ordinary video sits at 0.6.
    const ordinary = nicheForecast(b, 20_000, 60)!;
    expect(ordinary.basis).toBe("followers");
    expect(ordinary.estimate).toBe(12_000);
    expect(ordinary.low).toBeLessThan(ordinary.estimate);
    expect(ordinary.high).toBeGreaterThan(ordinary.estimate);
    const strong = nicheForecast(b, 20_000, 85)!;
    const weak = nicheForecast(b, 20_000, 35)!;
    expect(strong.estimate).toBeGreaterThan(ordinary.estimate);
    expect(weak.estimate).toBeLessThan(ordinary.estimate);
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
