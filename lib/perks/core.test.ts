import { describe, expect, it } from "vitest";
import { PLANS } from "@/lib/plans";
import { FIRST_STEPS, PERK_DAYS, STREAK_GOAL, firstWeek, firstWeekRewardDue, perkLive, perkUntil, perkWords, streakFrom, streakRewardDue, withPerk, type FirstSignals } from "./core";

// A Wednesday.
const now = new Date("2026-11-18T12:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
const none: FirstSignals = { connect: false, plan: false, video: false, schedule: false };
const all: FirstSignals = { connect: true, plan: true, video: true, schedule: true };

describe("the perk", () => {
  it("adds a little on top of the plan and never opens what the plan lacks", () => {
    const s = withPerk(PLANS.starter, true);
    expect(s.meters.ask_socia).toBe(PLANS.starter.meters.ask_socia + 10);
    expect(s.meters.content_plan).toBe(PLANS.starter.meters.content_plan + 1);
    expect(s.meters.animated_videos).toBe(PLANS.starter.meters.animated_videos);
    expect(withPerk(PLANS.free, true).meters.voiceovers).toBe(0);
    expect(withPerk(PLANS.free, false)).toBe(PLANS.free);
  });
  it("says what it adds", () => {
    expect(perkWords(PLANS.free)).toBe("10 more Ask SOCIA questions, 10 more hooks and captions and 1 more Content Plan");
  });
  it("runs thirty days, or keeps a later end it already had", () => {
    expect(new Date(perkUntil(null, now)).getTime()).toBe(now.getTime() + PERK_DAYS * 86_400_000);
    expect(perkUntil(ago(-60), now)).toBe(ago(-60));
    expect(perkLive(ago(-1), now)).toBe(true);
    expect(perkLive(ago(1), now)).toBe(false);
  });
});

describe("the first-week list", () => {
  it("shows a new account its four real steps and what is left", () => {
    const fw = firstWeek({ ...none, connect: true }, ago(2), null, now);
    expect(fw.show).toBe(true);
    expect(fw.steps.map((s) => s.id)).toEqual(FIRST_STEPS.map((s) => s.id));
    expect(fw.steps.filter((s) => s.done).map((s) => s.id)).toEqual(["connect"]);
    expect(fw.left).toBe(3);
    expect(fw.done).toBe(false);
  });
  it("is never shown to an older account that didn't finish", () => {
    expect(firstWeek(none, ago(31), null, now).show).toBe(false);
    expect(firstWeek(none, null, null, now).show).toBe(false);
  });
  it("stays up a few days once finished, then goes", () => {
    expect(firstWeek(all, ago(5), ago(1), now).show).toBe(true);
    expect(firstWeek(all, ago(20), ago(8), now).show).toBe(false);
    // Finished but not rewarded (an older account, or before the reward existed): nothing to show.
    expect(firstWeek(all, ago(90), null, now).show).toBe(false);
  });
  it("rewards finishing once, and only a new account", () => {
    expect(firstWeekRewardDue(firstWeek(all, ago(5), null, now), ago(5), null, now)).toBe(true);
    expect(firstWeekRewardDue(firstWeek(all, ago(5), ago(1), now), ago(5), ago(1), now)).toBe(false);
    expect(firstWeekRewardDue(firstWeek(all, ago(45), null, now), ago(45), null, now)).toBe(false);
    expect(firstWeekRewardDue(firstWeek({ ...all, schedule: false }, ago(5), null, now), ago(5), null, now)).toBe(false);
  });
});

describe("the posting streak", () => {
  it("counts weeks in a row with a published post", () => {
    const s = streakFrom([ago(1), ago(8), ago(15)], now);
    expect(s.weeks).toBe(3);
    expect(s.thisWeek).toBe(true);
    expect(s.strip).toHaveLength(8);
    expect(s.strip.slice(-3)).toEqual([true, true, true]);
    expect(s.strip.slice(0, 5)).toEqual([false, false, false, false, false]);
  });
  it("doesn't break on a week that isn't over yet", () => {
    const s = streakFrom([ago(8), ago(15)], now);
    expect(s.weeks).toBe(2);
    expect(s.thisWeek).toBe(false);
  });
  it("breaks on a missed week, and several posts in one week count once", () => {
    expect(streakFrom([ago(1), ago(15)], now).weeks).toBe(1);
    expect(streakFrom([ago(15), ago(22)], now).weeks).toBe(0);
    expect(streakFrom([ago(0), ago(1), ago(2)], now).weeks).toBe(1);
    expect(streakFrom([], now).weeks).toBe(0);
    expect(streakFrom([null, undefined], now).weeks).toBe(0);
  });
  it("treats Monday as the start of a week", () => {
    // 2026-11-16 is a Monday and 2026-11-15 a Sunday: two different weeks.
    const s = streakFrom(["2026-11-16T00:30:00Z", "2026-11-15T23:30:00Z"], now);
    expect(s.weeks).toBe(2);
  });
  it("rewards four in a row, at most once every four weeks", () => {
    const four = streakFrom([ago(1), ago(8), ago(15), ago(22)], now);
    expect(four.weeks).toBe(STREAK_GOAL);
    expect(streakRewardDue(four, null, now)).toBe(true);
    expect(streakRewardDue(four, ago(7), now)).toBe(false);
    expect(streakRewardDue(four, ago(28), now)).toBe(true);
    expect(streakRewardDue(streakFrom([ago(1), ago(8), ago(15)], now), null, now)).toBe(false);
  });
});
