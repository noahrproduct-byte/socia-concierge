import { describe, expect, it } from "vitest";
import { bucketize, bucketTitle, detectOutliers, seriesBaseline, granularityOptions, type SeriesPoint, type Series } from "./overview";

const pts = (vals: (number | null)[], from = "2026-08-31"): SeriesPoint[] => vals.map((v, i) => {
  const d = new Date(new Date(from + "T00:00:00Z").getTime() + i * 86400000).toISOString().slice(0, 10);
  return { day: d, value: v, postIds: v != null ? [`p${i}`] : [] };
});

describe("bucketize", () => {
  it("sums flow metrics by ISO week and keeps empty weeks null", () => {
    const b = bucketize(pts([1, 2, null, null, null, null, null, null, null, null, null, null, null, null, 5]), "week", "sum", "2026-09-20");
    expect(b.map((x) => x.value)).toEqual([3, null, 5]);
    expect(b[0].start).toBe("2026-08-31");
    expect(b[0].postIds).toEqual(["p0", "p1"]);
  });
  it("takes the last value for a level metric and never sums it", () => {
    const b = bucketize(pts([100, 110, 120, 125, 130, 131, 132]), "week", "last", "2026-09-06");
    expect(b).toHaveLength(1);
    expect(b[0].value).toBe(132);
    expect(b[0].partial).toBe(true);
  });
  it("labels months and flags the current one as partial", () => {
    const b = bucketize(pts([1, 1], "2026-08-30"), "month", "sum", "2026-09-07");
    expect(b.map((x) => x.key)).toEqual(["2026-08"]);
    expect(bucketTitle(b[0], "month")).toBe("August 2026");
    const c = bucketize(pts([1, 1], "2026-09-06"), "month", "sum", "2026-09-07");
    expect(c[0].partial).toBe(true);
    expect(bucketTitle(bucketize(pts([1], "2026-08-17"), "week", "sum")[0], "week")).toBe("Aug 17–23");
  });
});

describe("outliers and baseline", () => {
  it("finds one spike among ordinary days and leaves ordinary variation alone", () => {
    expect([...detectOutliers([12800, 18400, 103000, 21600, 24100])]).toEqual([2]);
    expect(detectOutliers([1000, 1200, 900, 1500, 1100]).size).toBe(0);
    expect(detectOutliers([5, 9000, null]).size).toBe(0); // too few to judge
  });
  it("uses the median post for post-total series and the median day for platform series", () => {
    const base = { metric: "views" as const, label: "Views", note: "", previous: [] as SeriesPoint[], total: 1, prevTotal: null };
    const s1: Series = { ...base, provenance: "publish_totals", current: pts([94000, 2000]) };
    expect(seriesBaseline(s1, [94000, 2000, 2400, 1800])).toEqual({ label: "Median post", value: 2200, kind: "median_post" });
    const s2: Series = { ...base, provenance: "instagram_daily", current: pts([1000, 3000, 2000, null]) };
    expect(seriesBaseline(s2)).toEqual({ label: "Typical day", value: 2000, kind: "median_day" });
  });
  it("only enables yearly with two calendar years of data", () => {
    expect(granularityOptions(365, "2026-04-28", "2026-09-07").find((g) => g.id === "year")!.enabled).toBe(false);
    expect(granularityOptions(365, "2025-04-28", "2026-09-07").find((g) => g.id === "year")!.enabled).toBe(true);
    expect(granularityOptions(30, "2026-04-28", "2026-09-07").find((g) => g.id === "month")!.enabled).toBe(false);
  });
});
