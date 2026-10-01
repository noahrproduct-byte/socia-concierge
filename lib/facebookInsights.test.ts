import { describe, it, expect } from "vitest";
import { insightWindows } from "./facebookInsights";

const DAY = 86400;

describe("insightWindows — Meta allows at most 90 days of Page Insights per query", () => {
  it("keeps a short range in a single window", () => {
    expect(insightWindows(0, 30 * DAY)).toEqual([[0, 30 * DAY]]);
  });

  it("splits a 12-month range into consecutive windows under the limit", () => {
    const w = insightWindows(0, 365 * DAY);
    expect(w.length).toBe(5);
    for (const [s, u] of w) expect(u - s).toBeLessThanOrEqual(89 * DAY);
    // consecutive, no gaps, covers the whole range
    expect(w[0][0]).toBe(0);
    expect(w[w.length - 1][1]).toBe(365 * DAY);
    for (let i = 1; i < w.length; i++) expect(w[i][0]).toBe(w[i - 1][1]);
  });

  it("returns nothing for an empty range", () => {
    expect(insightWindows(100, 100)).toEqual([]);
  });
});
