import { describe, it, expect } from "vitest";
import {
  detectBreakouts, detectPerformanceChange, detectCompetitorMoves, detectNicheTrends, detectFormatGap,
  formatBucket, median, isoWeekKey,
} from "./alertDetectors";

const DAY = 86400000;
const NOW = Date.UTC(2026, 8, 29); // a Tuesday
const WK = "2026-W40";
const dayStr = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString().slice(0, 10);

function post(id: string, format: string, interactions: number, daysAgo = 1) {
  return { id, format, interactions, timestampMs: NOW - daysAgo * DAY, permalink: `/p/${id}` };
}

describe("median", () => {
  it("handles odd, even and empty", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("detectBreakouts", () => {
  it("flags a recent post far above its own format median, excluding itself from the bar", () => {
    const posts = [
      post("a", "Reel", 30, 10), // old peers set the median (30,20,40,25 -> 27.5)
      post("b", "Reel", 20, 12),
      post("c", "Reel", 40, 9),
      post("d", "Reel", 25, 8),
      post("hit", "Reel", 300, 1), // 300 / median(30,20,40,25)=27.5 = 10.9x
    ];
    const out = detectBreakouts({ platform: "instagram", posts, now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0].fingerprint).toBe("breakout:instagram:hit");
    expect(out[0].severity).toBe("good");
    expect(out[0].evidence.multiplier).toBeGreaterThanOrEqual(3);
    expect(out[0].entityRef).toBe("/p/hit");
    expect(out[0].title).toContain("Reel");
  });

  it("does not fire without enough posts in the format to set a fair bar", () => {
    const posts = [post("a", "Carousel", 10, 2), post("hit", "Carousel", 90, 1)];
    expect(detectBreakouts({ platform: "instagram", posts, now: NOW })).toHaveLength(0);
  });

  it("ignores a breakout that is older than the window", () => {
    const posts = [
      post("a", "Reel", 30, 30), post("b", "Reel", 20, 31), post("c", "Reel", 25, 32),
      post("old", "Reel", 300, 20), // above median but 20 days old
    ];
    expect(detectBreakouts({ platform: "instagram", posts, now: NOW })).toHaveLength(0);
  });

  it("does not let one post set its own bar (excludes the candidate from the median)", () => {
    // Three identical peers at 100, candidate at 100: median of peers is 100, 1x, no alert.
    const posts = [post("a", "Reel", 100, 3), post("b", "Reel", 100, 4), post("c", "Reel", 100, 5), post("d", "Reel", 100, 1)];
    expect(detectBreakouts({ platform: "instagram", posts, now: NOW })).toHaveLength(0);
  });
});

describe("detectPerformanceChange", () => {
  const base = { platform: "instagram", metric: "reach", metricLabel: "Reach", periodDays: 7, weekKey: "2026-W40" };

  it("fires on a rise past the threshold, marked good", () => {
    const a = detectPerformanceChange({ ...base, current: 1400, previous: 1000 });
    expect(a).not.toBeNull();
    expect(a!.severity).toBe("good");
    expect(a!.title).toContain("up 40%");
    expect(a!.fingerprint).toBe("perf:instagram:reach:2026-W40");
  });

  it("fires on a drop, marked warning", () => {
    const a = detectPerformanceChange({ ...base, current: 600, previous: 1000 });
    expect(a!.severity).toBe("warning");
    expect(a!.title).toContain("down 40%");
  });

  it("stays quiet under the threshold, on unknown values, or from a near-zero base", () => {
    expect(detectPerformanceChange({ ...base, current: 1100, previous: 1000 })).toBeNull(); // 10%
    expect(detectPerformanceChange({ ...base, current: null, previous: 1000 })).toBeNull();
    expect(detectPerformanceChange({ ...base, current: 50, previous: 0 })).toBeNull();
    expect(detectPerformanceChange({ ...base, current: 50, previous: 0, floor: 1 })).toBeNull();
  });
});

describe("isoWeekKey", () => {
  it("is stable within a week and changes across weeks", () => {
    const mon = isoWeekKey(new Date("2026-09-28T00:00:00Z"));
    const sun = isoWeekKey(new Date("2026-10-04T23:59:00Z"));
    const nextMon = isoWeekKey(new Date("2026-10-05T00:00:00Z"));
    expect(mon).toBe(sun);
    expect(nextMon).not.toBe(mon);
  });
});

describe("detectCompetitorMoves", () => {
  it("fires on a follower move past the threshold, newest vs oldest", () => {
    const out = detectCompetitorMoves({
      platform: "instagram",
      competitors: [{ handle: "@rival", points: [
        { day: dayStr(6), followers: 10000 },
        { day: dayStr(3), followers: 10500 },
        { day: dayStr(0), followers: 11000 }, // 10000 -> 11000 = +10%
      ] }],
      weekKey: WK,
    });
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("competitor_move");
    expect(out[0].fingerprint).toBe("competitor_move:instagram:rival:2026-W40");
    expect(out[0].evidence.pct).toBe(10);
    expect(out[0].title).toContain("gained");
  });

  it("marks a decline and reports it, still info severity", () => {
    const out = detectCompetitorMoves({
      platform: "instagram",
      competitors: [{ handle: "rival", points: [{ day: dayStr(5), followers: 10000 }, { day: dayStr(0), followers: 8500 }] }],
      weekKey: WK,
    });
    expect(out[0].title).toContain("lost");
    expect(out[0].severity).toBe("info");
    expect(out[0].evidence.pct).toBe(-15);
  });

  it("stays quiet under threshold, below the follower floor, or with one dated point", () => {
    expect(detectCompetitorMoves({ platform: "instagram", weekKey: WK, competitors: [
      { handle: "a", points: [{ day: dayStr(5), followers: 10000 }, { day: dayStr(0), followers: 10300 }] }, // 3%
    ] })).toHaveLength(0);
    expect(detectCompetitorMoves({ platform: "instagram", weekKey: WK, competitors: [
      { handle: "b", points: [{ day: dayStr(5), followers: 50 }, { day: dayStr(0), followers: 100 }] }, // below floor
    ] })).toHaveLength(0);
    expect(detectCompetitorMoves({ platform: "instagram", weekKey: WK, competitors: [
      { handle: "c", points: [{ day: dayStr(0), followers: 10000 }] }, // one point
    ] })).toHaveLength(0);
  });
});

describe("detectNicheTrends", () => {
  const item = (tags: string[], multiplier: number | null, daysAgo = 2) => ({ trendTags: tags, multiplier, whenMs: NOW - daysAgo * DAY });

  it("flags a tag carried by enough recent winners, strongest first", () => {
    const out = detectNicheTrends({
      now: NOW, weekKey: WK,
      items: [item(["asmr"], 3), item(["asmr"], 2.5), item(["asmr"], 4), item(["plating"], 2), item(["plating"], 2)],
    });
    expect(out[0].fingerprint).toBe("trend:asmr:2026-W40");
    expect(out[0].type).toBe("trend");
    expect(out[0].evidence.count).toBe(3);
    expect(out[0].severity).toBe("good");
  });

  it("ignores under-count tags, losers below the multiple, and content outside the window", () => {
    expect(detectNicheTrends({ now: NOW, weekKey: WK, items: [item(["x"], 3), item(["x"], 3)] })).toHaveLength(0); // only 2
    expect(detectNicheTrends({ now: NOW, weekKey: WK, items: [item(["x"], 1), item(["x"], 1), item(["x"], 1.5)] })).toHaveLength(0); // not winning
    expect(detectNicheTrends({ now: NOW, weekKey: WK, items: [item(["x"], 3, 60), item(["x"], 3, 61), item(["x"], 3, 62)] })).toHaveLength(0); // too old
  });

  it("caps the number of alerts", () => {
    const items = ["a", "b", "c", "d", "e"].flatMap((t) => [item([t], 3), item([t], 3), item([t], 3)]);
    expect(detectNicheTrends({ now: NOW, weekKey: WK, items }).length).toBeLessThanOrEqual(3);
  });
});

describe("detectFormatGap", () => {
  it("normalizes IG and niche vocab into coarse buckets", () => {
    expect(formatBucket("Reel")).toBe("video");
    expect(formatBucket("short")).toBe("video");
    expect(formatBucket("Carousel")).toBe("image");
    expect(formatBucket("something")).toBeNull();
  });

  it("fires when the niche leans on a format the account barely posts", () => {
    const out = detectFormatGap({
      weekKey: WK,
      nicheWinnerFormats: ["short", "reel", "video", "short", "video"], // 100% video
      userFormats: ["Image", "Carousel", "Image", "Image", "Carousel", "Image"], // 0% video
    });
    expect(out).not.toBeNull();
    expect(out!.type).toBe("opportunity");
    expect(out!.fingerprint).toBe("opportunity:format:video:2026-W40");
    expect(out!.evidence.nicheSharePct).toBe(100);
    expect(out!.evidence.userSharePct).toBe(0);
  });

  it("stays quiet with small samples or when the account already posts the format", () => {
    expect(detectFormatGap({ weekKey: WK, nicheWinnerFormats: ["short", "reel"], userFormats: ["Image", "Image"] })).toBeNull(); // too small
    expect(detectFormatGap({
      weekKey: WK,
      nicheWinnerFormats: ["short", "reel", "video", "short"],
      userFormats: ["Reel", "Reel", "Reel", "Carousel", "Reel", "Image"], // already mostly video
    })).toBeNull();
  });
});
