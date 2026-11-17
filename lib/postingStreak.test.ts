import { describe, expect, it } from "vitest";
import {
  addDays, canFinalize, canPlanBreak, localDay, nextTargetStart, postingDaysByWeek, streakOf, targetChangeNeeded, targetForWeek, weekLine, weekStartOf, weeksView,
  type LedgerWeek, type TargetChange,
} from "./postingStreak";

const TZ = "America/Chicago";
// Monday 2026-11-16 is the current week in these tests.
const TODAY = "2026-11-18";
const at = (day: string, hour = 12) => `${day}T${String(hour).padStart(2, "0")}:00:00-06:00`;
const posts = (days: string[]) => postingDaysByWeek(days.map((d) => at(d)), TZ);
const view = (o: { live?: Map<string, Set<string>>; ledger?: LedgerWeek[]; history?: TargetChange[]; weeks?: number }) =>
  weeksView({ today: TODAY, ledger: o.ledger ?? [], history: o.history ?? [], live: o.live ?? new Map(), weeks: o.weeks ?? 8 });
const five: TargetChange[] = [{ days: 5, effective_from: "2026-10-19" }];
const week = (start: string, n: number) => Array.from({ length: n }, (_, i) => addDays(start, i));

describe("posting days", () => {
  it("are local calendar days, so the person's time zone decides", () => {
    // 11:30 pm on Sunday in Chicago is already Monday in UTC.
    expect(localDay("2026-11-16T05:30:00Z", TZ)).toBe("2026-11-15");
    expect(localDay("2026-11-16T05:30:00Z", "UTC")).toBe("2026-11-16");
    expect(localDay("nonsense", TZ)).toBeNull();
    expect(localDay("2026-11-16T05:30:00Z", "Not/AZone")).toBe("2026-11-16");
    expect(weekStartOf("2026-11-15")).toBe("2026-11-09");
    expect(weekStartOf("2026-11-16")).toBe("2026-11-16");
  });
  it("count once however many posts go out that day", () => {
    const m = postingDaysByWeek([at("2026-11-16", 9), at("2026-11-16", 13), at("2026-11-16", 20), at("2026-11-17"), null, "bad"], TZ);
    expect([...m.get("2026-11-16")!]).toEqual(["2026-11-16", "2026-11-17"]);
  });
});

describe("the weekly target", () => {
  it("is the one in force when the week began, and one day a week before any was chosen", () => {
    const h: TargetChange[] = [{ days: 3, effective_from: "2026-10-19" }, { days: 5, effective_from: "2026-11-09" }];
    expect(targetForWeek("2026-10-12", h)).toBe(1);
    expect(targetForWeek("2026-10-19", h)).toBe(3);
    expect(targetForWeek("2026-11-02", h)).toBe(3);
    expect(targetForWeek("2026-11-09", h)).toBe(5);
    expect(targetForWeek("2026-11-16", h)).toBe(5);
  });
  it("changes from the next week, never the one in progress", () => {
    expect(nextTargetStart("2026-11-18")).toBe("2026-11-23");
    expect(nextTargetStart("2026-11-16")).toBe("2026-11-23");
    expect(targetChangeNeeded(5, [], "2026-11-18")).toEqual({ days: 5, effective_from: "2026-11-23" });
    expect(targetChangeNeeded(5, five, "2026-11-18")).toBeNull();
    expect(targetChangeNeeded(1, [], "2026-11-18")).toBeNull();
    expect(targetChangeNeeded(null, five, "2026-11-18")).toBeNull();
    expect(targetChangeNeeded(9, five, "2026-11-18")).toBeNull();
  });
  it("can't be lowered to rescue the week in progress or weeks gone by", () => {
    // Target 5; this week only 3 posting days. Lowering to 3 on Wednesday starts next Monday.
    const lowered = [...five, targetChangeNeeded(3, five, TODAY)!];
    const w = view({ history: lowered, live: posts(week("2026-11-16", 3)) });
    const cur = w[w.length - 1];
    expect(cur).toMatchObject({ target: 5, days: 3, qualified: false });
    expect(targetForWeek("2026-11-23", lowered)).toBe(3);
  });
});

describe("the streak", () => {
  it("follows the brief's example: five, six, four, five", () => {
    const live = posts([...week("2026-10-19", 5), ...week("2026-10-26", 6), ...week("2026-11-02", 4), ...week("2026-11-09", 5)]);
    const s = streakOf(view({ history: five, live }));
    expect(s.strip.slice(-5).map((x) => x.state)).toEqual(["hit", "hit", "miss", "hit", "open"]);
    // The fourth week began a new streak; this week is still open, so it hasn't broken it.
    expect(s.weeks).toBe(1);
    expect(s.longest).toBe(2);
  });
  it("counts this week as soon as it qualifies", () => {
    const live = posts([...week("2026-11-09", 5), ...week("2026-11-16", 5)]);
    expect(streakOf(view({ history: five, live })).weeks).toBe(2);
  });
  it("works for two, five and seven day targets", () => {
    for (const n of [2, 5, 7]) {
      const h = [{ days: n, effective_from: "2026-10-19" }];
      const hit = posts([...week("2026-11-02", n), ...week("2026-11-09", n)]);
      expect(streakOf(view({ history: h, live: hit })).weeks).toBe(2);
      const short = posts([...week("2026-11-02", n), ...week("2026-11-09", n - 1)]);
      expect(streakOf(view({ history: h, live: short })).weeks).toBe(0);
    }
  });
  it("steps over a planned break week", () => {
    const live = posts([...week("2026-10-26", 5), ...week("2026-11-09", 5)]);
    const ledger: LedgerWeek[] = [{ week_start: "2026-11-02", target: 5, days: 0, qualified: false, is_break: true, finalized: true }];
    const s = streakOf(view({ history: five, live, ledger }));
    expect(s.weeks).toBe(2);
    expect(s.strip.slice(-4).map((x) => x.state)).toEqual(["hit", "break", "hit", "open"]);
  });
  it("keeps a finished week as it was written down, whatever the platform shows later", () => {
    // Written down as 5 of 5; the posts have since been deleted (nothing live), and the target was changed.
    const ledger: LedgerWeek[] = [{ week_start: "2026-11-09", target: 5, days: 5, qualified: true, is_break: false, finalized: true }];
    const w = view({ history: [{ days: 7, effective_from: "2026-10-19" }], live: new Map(), ledger });
    expect(w[w.length - 2]).toMatchObject({ target: 5, days: 5, qualified: true });
    expect(streakOf(w).weeks).toBe(1);
  });
  it("waits before writing a week down, so a late platform read still counts", () => {
    // The week of Nov 9 ends at local midnight starting Nov 16.
    expect(canFinalize("2026-11-09", new Date("2026-11-16T10:00:00-06:00"), TZ)).toBe(false);
    expect(canFinalize("2026-11-09", new Date("2026-11-17T13:00:00-06:00"), TZ)).toBe(true);
    expect(canFinalize("2026-11-16", new Date("2026-11-18T12:00:00-06:00"), TZ)).toBe(false);
  });
  it("limits planned breaks", () => {
    const b = (ws: string): LedgerWeek => ({ week_start: ws, target: 5, days: 0, qualified: false, is_break: true, finalized: false });
    expect(canPlanBreak("2026-11-16", [])).toBe(true);
    expect(canPlanBreak("2026-11-16", [b("2026-10-05")])).toBe(true);
    expect(canPlanBreak("2026-11-16", [b("2026-10-05"), b("2026-11-02")])).toBe(false);
    // A break long ago doesn't use up the allowance.
    expect(canPlanBreak("2026-11-16", [b("2026-06-01"), b("2026-11-02")])).toBe(true);
  });
});

describe("what SIO says about the week", () => {
  const t = (days: number, target: number, extra: Partial<{ is_break: boolean }> = {}) => ({ days, target, qualified: days >= target, is_break: false, ...extra });
  it("is helpful and never a telling-off", () => {
    expect(weekLine(t(4, 5))).toBe("One more posting day and you'll complete your weekly goal.");
    expect(weekLine(t(2, 5))).toBe("You're at 2 of your 5 posting days this week.");
    expect(weekLine(t(0, 5))).toBe("Your target this week is 5 posting days.");
    expect(weekLine(t(5, 5))).toBe("You've hit your 5 posting days this week.");
    expect(weekLine(t(6, 5))).toBe("You've posted on 6 days this week, past your target of 5.");
    expect(weekLine(t(1, 1))).toBe("You've hit your 1 posting day this week.");
    expect(weekLine(t(0, 5, { is_break: true }))).toContain("planned break week");
    for (const d of [0, 1, 2, 3, 4]) expect(weekLine(t(d, 5))).not.toMatch(/behind|only|fail|miss|should|must/i);
  });
});
