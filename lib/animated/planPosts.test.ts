import { describe, expect, it } from "vitest";
import { cleanAnimatedPosts } from "./planPosts";
import { animatedDay, animatedHour, isAnimatedDay } from "./day";
import { animatedPerDay } from "./fitCore";
import { sanitizePlanItems } from "@/lib/planItems";
import { weekdayIndex } from "@/lib/scheduling";
import { PLANS, PLAN_ORDER } from "@/lib/plans";

const P = (weekday: string, slot: number, extra: Record<string, unknown> = {}) => ({ weekday, slot, title: `${weekday} ${slot}`, hook: "Same beans, three coffees", concept: "Three grind sizes and their shot times.", template: "compare", ...extra });

describe("animated plan posts", () => {
  it("labels animated days so they parse as their weekday but are told apart from the filmed post", () => {
    expect(animatedDay("Monday", 1)).toBe("Monday (animated)");
    expect(animatedDay("Monday", 2)).toBe("Monday (animated 2)");
    expect(weekdayIndex("Wednesday (animated 2)")).toBe(weekdayIndex("Wednesday"));
    expect(isAnimatedDay("Monday (animated)")).toBe(true);
    expect(isAnimatedDay("Monday")).toBe(false);
  });

  it("keeps one post per day and slot, drops slot 2 when one a day was asked for, and sorts by week", () => {
    const raw = { posts: [P("Wednesday", 1), P("Monday", 2), P("Monday", 1), P("Monday", 1), P("Funday", 1), P("Tuesday", 1, { hook: "" })] };
    const one = cleanAnimatedPosts(raw, 1, "Instagram");
    expect(one.map((p) => p.day)).toEqual(["Monday (animated)", "Wednesday (animated)"]);
    expect(one.every((p) => p.animated && p.format === "Animated video" && p.platform === "Instagram" && p.predictedPerformance === "")).toBe(true);
    const two = cleanAnimatedPosts(raw, 2);
    expect(two.map((p) => [p.day, p.slot])).toEqual([["Monday (animated)", 1], ["Monday (animated 2)", 2], ["Wednesday (animated)", 1]]);
    expect(two[0].rationale).toContain("a comparison");
  });

  it("survives a save from the browser: the flag and slot are kept, nothing else is trusted", () => {
    const [kept] = sanitizePlanItems([{ day: "Friday (animated 2)", concept: "c", hook: "h", format: "Animated video", rationale: "", evidence: "", predictedPerformance: "", animated: true, slot: 2 }]);
    expect(kept.day).toBe("Friday (animated 2)");
    expect(kept.animated).toBe(true);
    expect(kept.slot).toBe(2);
    const [filmed] = sanitizePlanItems([{ day: "Friday", concept: "c", hook: "h", format: "Reel", rationale: "", evidence: "", predictedPerformance: "", slot: 2 }]);
    expect(filmed.animated).toBeUndefined();
    expect(filmed.slot).toBeUndefined();
  });

  it("goes out a few hours either side of the filmed post's hour, never on it", () => {
    for (const best of [8, 12, 15, 19, 21, 23]) {
      for (const slot of [1, 2] as const) {
        const h = animatedHour(best, slot);
        expect(h).not.toBe(best);
        expect(h).toBeGreaterThanOrEqual(8);
        expect(h).toBeLessThanOrEqual(22);
      }
      expect(animatedHour(best, 1)).not.toBe(animatedHour(best, 2));
    }
  });

  it("is off, one or two a day from the saved choice", () => {
    expect(animatedPerDay(undefined)).toBe(0);
    expect(animatedPerDay({ on: false, perDay: 2 })).toBe(0);
    expect(animatedPerDay({ on: true })).toBe(1);
    expect(animatedPerDay({ on: true, perDay: 2 })).toBe(2);
  });

  it("has its own monthly allowance: one a day fits Starter, two a day fits Growth and up", () => {
    expect(PLAN_ORDER.map((p) => PLANS[p].meters.animated_videos)).toEqual([0, 30, 60, 120, 120]);
  });
});
