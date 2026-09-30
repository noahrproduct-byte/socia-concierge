import { describe, it, expect } from "vitest";
import { competitorMomentum, type CompetitorPoint } from "./competitorHistory";

const pt = (day: string, followers: number | null): CompetitorPoint => ({ day, followers, media_count: null, views_total: null });

describe("competitorMomentum", () => {
  it("compares newest against oldest in the window (points are newest-first)", () => {
    const points = [pt("2026-09-29", 1100), pt("2026-09-26", 1050), pt("2026-09-22", 1000)];
    const m = competitorMomentum(points, 7);
    expect(m.current).toBe(1100);
    expect(m.previous).toBe(1000);
    expect(m.deltaPct).toBeCloseTo(10, 5);
    expect(m.points).toBe(3);
  });

  it("returns null delta with only one data point (history still collecting)", () => {
    const m = competitorMomentum([pt("2026-09-29", 1100)], 7);
    expect(m.current).toBe(1100);
    expect(m.previous).toBeNull();
    expect(m.deltaPct).toBeNull();
    expect(m.points).toBe(1);
  });

  it("is empty and null when there is no history at all", () => {
    const m = competitorMomentum([], 7);
    expect(m.current).toBeNull();
    expect(m.deltaPct).toBeNull();
    expect(m.points).toBe(0);
  });

  it("ignores points whose follower count is unknown, never treating them as zero", () => {
    const points = [pt("2026-09-29", 1200), pt("2026-09-27", null), pt("2026-09-24", 1000)];
    const m = competitorMomentum(points, 7);
    expect(m.current).toBe(1200);
    expect(m.previous).toBe(1000);
    expect(m.points).toBe(2);
  });

  it("does not divide by a zero base", () => {
    const m = competitorMomentum([pt("2026-09-29", 50), pt("2026-09-22", 0)], 7);
    expect(m.deltaPct).toBeNull();
  });
});
