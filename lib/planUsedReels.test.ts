import { describe, expect, it } from "vitest";
import { reelKey, unusedReels, usedReelUrls } from "./planEvidence";

describe("competitor Reels go into one plan only", () => {
  const plans = [
    { data: { weeklyPlan: [{ ref: { url: "https://www.instagram.com/reel/AAA/?igsh=x" } }, {}] } },
    { data: { weeklyPlan: [{ ref: { url: "https://instagram.com/reel/BBB/" } }] } },
    { data: null },
  ];
  it("collects each earlier post's reference, however it was linked", () => {
    const used = usedReelUrls(plans);
    expect(used.has(reelKey("https://www.instagram.com/reel/AAA"))).toBe(true);
    expect(used.size).toBe(2);
  });
  it("leaves out the Reels already used", () => {
    const reels = [{ url: "https://www.instagram.com/reel/AAA/" }, { url: "https://instagram.com/reel/BBB" }, { url: "https://instagram.com/reel/CCC/" }];
    expect(unusedReels(reels, usedReelUrls(plans)).map((r) => r.url)).toEqual(["https://instagram.com/reel/CCC/"]);
    expect(unusedReels(reels, new Set())).toHaveLength(3);
  });
});
