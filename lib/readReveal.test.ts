import { describe, expect, it } from "vitest";
import { ticksFor } from "@/lib/readReveal";
import { offlineReason } from "@/lib/platformStatus";

describe("ticksFor: one tick per post read", () => {
  it("groups the ticks by format, one per post", () => {
    expect(ticksFor([{ format: "Reel", count: 14 }, { format: "Carousel", count: 6 }], 20)).toEqual([{ format: "Reel", ticks: 14 }, { format: "Carousel", ticks: 6 }]);
  });
  it("scales down evenly past 60, never hiding a format", () => {
    const g = ticksFor([{ format: "Reel", count: 100 }, { format: "Image", count: 1 }], 101);
    expect(g.reduce((s, x) => s + x.ticks, 0)).toBeLessThanOrEqual(61);
    expect(g[1]).toEqual({ format: "Image", ticks: 1 });
  });
  it("uses the post count when formats aren't known, and nothing when nothing was read", () => {
    expect(ticksFor([], 9)).toEqual([{ format: "Post", ticks: 9 }]);
    expect(ticksFor([], 0)).toEqual([]);
  });
});

describe("offline platforms", () => {
  it("says Facebook and TikTok aren't open yet, and nothing about the others", () => {
    expect(offlineReason("Facebook")).toMatch(/aren't open yet/);
    expect(offlineReason("tiktok")).toMatch(/aren't open yet/);
    expect(offlineReason("instagram")).toBeNull();
    expect(offlineReason("YouTube")).toBeNull();
  });
});
