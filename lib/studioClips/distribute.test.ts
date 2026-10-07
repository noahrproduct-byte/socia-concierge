import { describe, it, expect } from "vitest";
import { planPosts, similar, freeDays, moveTo, type PlanOpportunity } from "./distribute";
import type { TimedPost } from "@/lib/postingTimes";

const TZ = "America/Chicago";
const NOW = new Date("2026-10-07T15:00:00Z"); // Wednesday 10 AM in Chicago
const opp = (idx: number, strength: "strong" | "possible", clipIds: string[], tags: string[] = []): PlanOpportunity => ({ idx, title: `Post ${idx}`, strength, clipIds, tags });

/** Posts at a weekday/hour in Chicago with engagement e. */
function posts(spec: [string, number, number][]): TimedPost[] {
  // spec: [ISO date (local), hour, engagement]
  return spec.map(([date, hour, e], i) => ({ id: `p${i}`, t: new Date(`${date}T${String(hour).padStart(2, "0")}:30:00-05:00`).toISOString(), e, format: "Reel" }));
}

describe("plan these posts", () => {
  it("spreads posts out, strongest first, with placeholder times and no history", () => {
    const plan = planPosts({ opportunities: [opp(0, "possible", ["c1"]), opp(1, "strong", ["c2"]), opp(2, "possible", ["c3"])], existing: [], history: null, now: NOW, tz: TZ });
    expect(plan.placements.map((p) => p.idx)).toEqual([1, 0, 2]);
    expect(plan.placements[0].date).toBe("2026-10-08");
    expect(new Set(plan.placements.map((p) => p.date)).size).toBe(3);
    expect(plan.placements.every((p) => !p.timeChosen)).toBe(true);
    expect(plan.placements[0].at).toBe("2026-10-08T17:00:00.000Z"); // noon in Chicago
    expect(plan.placements[0].reasons).toContain("Placeholder time: set it in Create Post.");
    expect(plan.timing).toMatch(/hasn't read this account's posting history/);
  });

  it("never doubles up on a day that already has a post, and says so", () => {
    const plan = planPosts({ opportunities: [opp(0, "strong", ["c1"])], existing: [{ id: "x", at: "2026-10-08T23:00:00Z", label: "Taco Tuesday recap" }], history: null, now: NOW, tz: TZ });
    expect(plan.placements[0].date).toBe("2026-10-09");
    expect(plan.placements[0].reasons.join(" ")).toMatch(/Thursday already has a post \(“Taco Tuesday recap”\)/);
  });

  it("keeps posts that share footage off neighbouring days", () => {
    const plan = planPosts({ opportunities: [opp(0, "strong", ["c1", "c2"]), opp(1, "strong", ["c2"])], existing: [], history: null, now: NOW, tz: TZ, horizonDays: 3 });
    const [a, b] = plan.placements.map((p) => Number(p.date.slice(-2)));
    expect(Math.abs(a - b)).toBeGreaterThanOrEqual(2);
    expect(similar(opp(0, "strong", ["a"], ["pizza", "oven"]), opp(1, "strong", ["b"], ["Pizza", "oven", "dough"]))).toBe(true);
  });

  it("uses a measured window only when the history supports it", () => {
    // 10 posts: Tuesdays 6-9 PM do 3x the others.
    const hist = posts([
      ["2026-09-01", 19, 300], ["2026-09-08", 19, 320], ["2026-09-15", 18, 310], ["2026-09-22", 19, 290],
      ["2026-09-02", 10, 100], ["2026-09-03", 11, 90], ["2026-09-04", 9, 110], ["2026-09-10", 10, 100], ["2026-09-11", 13, 95], ["2026-09-17", 12, 105],
    ]);
    // From Sunday, Tuesday is two days out: worth the short wait.
    const sunday = new Date("2026-10-11T15:00:00Z");
    const plan = planPosts({ opportunities: [opp(0, "strong", ["c1"])], existing: [], history: hist, now: sunday, tz: TZ });
    const p = plan.placements[0];
    expect(p.date).toBe("2026-10-13");
    expect(p.timeChosen).toBe(true);
    expect(p.at).toBe("2026-10-13T23:15:00.000Z"); // 6:15 PM Chicago (CDT)
    expect(p.reasons[0]).toMatch(/^Your Instagram posts on Tuesdays between 6 and 9 PM have done \+\d+% vs typical \(4 posts\)\.$/);
    // From Wednesday it doesn't wait six days: tomorrow, with a placeholder time.
    const wed = planPosts({ opportunities: [opp(0, "strong", ["c1"])], existing: [], history: hist, now: NOW, tz: TZ }).placements[0];
    expect(wed).toMatchObject({ date: "2026-10-08", timeChosen: false });
  });

  it("spreads several posts across the fortnight and uses the backed day when it falls in reach", () => {
    const hist = posts([
      ["2026-09-01", 19, 300], ["2026-09-08", 19, 320], ["2026-09-15", 18, 310], ["2026-09-22", 19, 290],
      ["2026-09-02", 10, 100], ["2026-09-03", 11, 90], ["2026-09-04", 9, 110], ["2026-09-10", 10, 100], ["2026-09-11", 13, 95], ["2026-09-17", 12, 105],
    ]);
    const plan = planPosts({ opportunities: [opp(0, "strong", ["a"]), opp(1, "strong", ["b"]), opp(2, "possible", ["c"])], existing: [{ id: "x", at: "2026-10-08T23:00:00Z", label: "Recap" }], history: hist, now: NOW, tz: TZ });
    const dates = plan.placements.map((p) => p.date);
    expect(dates).toEqual(["2026-10-09", "2026-10-13", "2026-10-16"]);
    expect(plan.placements[1].timeChosen).toBe(true);
    expect(plan.placements[0].reasons.join(" ")).toMatch(/Thursday already has a post \(“Recap”\), so this goes on Friday/);
  });

  it("says when there are too few posts to pick times", () => {
    const plan = planPosts({ opportunities: [opp(0, "strong", ["c1"])], existing: [], history: posts([["2026-09-01", 19, 300]]), now: NOW, tz: TZ });
    expect(plan.timing).toMatch(/Not enough posting history to recommend times \(1 posts; SOCIA needs 8\)/);
  });

  it("reports what it couldn't fit instead of crowding the calendar", () => {
    const existing = Array.from({ length: 14 }, (_, i) => ({ id: `e${i}`, at: new Date(Date.UTC(2026, 9, 8 + i, 18)).toISOString(), label: "x" }));
    const plan = planPosts({ opportunities: [opp(0, "strong", ["c1"])], existing, history: null, now: NOW, tz: TZ });
    expect(plan.placements).toEqual([]);
    expect(plan.unplaced[0].reason).toMatch(/No free day/);
  });

  it("lets a person move a post to another free day", () => {
    const plan = planPosts({ opportunities: [opp(0, "strong", ["c1"]), opp(1, "possible", ["c2"])], existing: [], history: null, now: NOW, tz: TZ });
    const days = freeDays(plan, [], NOW, TZ, plan.placements[0].date);
    expect(days.some((d) => d.date === plan.placements[1].date)).toBe(false);
    const moved = moveTo(plan.placements[0], "2026-10-16", null, TZ);
    expect(moved).toMatchObject({ date: "2026-10-16", at: "2026-10-16T17:00:00.000Z", timeChosen: false });
  });
});
