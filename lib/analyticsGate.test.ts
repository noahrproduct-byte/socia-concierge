import { describe, expect, it } from "vitest";
import { withoutComparison } from "./analyticsGate";

describe("withoutComparison", () => {
  const data = {
    rangeLabel: "Last 30 days",
    kpis: [{ id: "views", value: "12K", raw: 12000, deltaPct: 14.2, deltaText: "↑ 14%", positive: true, note: "vs. previous 30 days" }],
    series: { views: { label: "Views", current: [{ day: "2026-10-01", value: 5 }], previous: [{ day: "2026-09-01", value: 3 }], total: 5, prevTotal: 3 } },
    changes: [{ key: "views", current: "5", previous: "3", delta: "↑ 66%", positive: true }],
    tiles: [{ key: "subs", value: "9", delta: "↑ 2", positive: true, status: "ok" }],
    posts: [{ id: "p", views: 4 }],
  };

  it("removes every previous-period value and keeps the current ones", () => {
    const out = withoutComparison(data, "last 30 days");
    const text = JSON.stringify(out);
    for (const leaked of ["14.2", "14%", "66%", "↑ 2", "2026-09-01", '"previous":"3"', '"prevTotal":3']) expect(text).not.toContain(leaked);
    expect(out.kpis[0]).toMatchObject({ note: "last 30 days", value: "12K", raw: 12000, deltaPct: null, deltaText: null, positive: null });
    expect(out.series.views).toMatchObject({ total: 5, prevTotal: null, previous: [], current: [{ day: "2026-10-01", value: 5 }] });
    expect(out.changes[0]).toMatchObject({ current: "5", previous: null, delta: null, positive: null });
    expect(out.posts).toEqual(data.posts);
    // The original is untouched.
    expect(data.kpis[0].deltaPct).toBe(14.2);
  });
});
