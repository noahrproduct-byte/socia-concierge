import { describe, it, expect } from "vitest";
import { hoursLeft, startRefusal, type StreamAllowance } from "./limits";
import { PLAN_ORDER, PLANS, minPlanWithFeature } from "@/lib/plans";

const a = (over: Partial<StreamAllowance> = {}): StreamAllowance => ({ channels: 2, hoursMonth: 40, keepVideo: true, usedSeconds: 0, periodStart: "2026-11-01", resetsOn: "2026-12-01", ...over });

describe("Live streams by plan (Noah, 2026-11-16)", () => {
  it("sets channels at once and hours a month per plan, and keeps the video from Growth", () => {
    expect(PLAN_ORDER.map((p) => PLANS[p].limits.stream_channels)).toEqual([0, 1, 2, 4, 4]);
    expect(PLAN_ORDER.map((p) => PLANS[p].limits.stream_hours_month)).toEqual([0, 10, 40, 120, 400]);
    expect(minPlanWithFeature("stream_clipper")).toBe("starter");
    expect(minPlanWithFeature("stream_clip_video")).toBe("growth");
  });
  it("starts a channel only within the plan's channels and hours, and says why not", () => {
    expect(startRefusal(a(), 1, 1)).toBeNull();
    expect(startRefusal(a(), 2, 1)).toMatch(/2 live streams at a time\. Stop one first/);
    expect(startRefusal(a({ channels: 1, hoursMonth: 10 }), 1, 1)).toMatch(/1 live stream at a time/);
    expect(startRefusal(a({ usedSeconds: 40 * 3600 }), 0, 1)).toBe("This month's 40 hours of live stream watching are used. They come back on Dec 1.");
    expect(startRefusal(a({ channels: 0, hoursMonth: 0 }), 0, 1)).toBe("Live streams aren't on your plan.");
  });
  it("shows hours used and left to a tenth", () => {
    expect(hoursLeft(a({ usedSeconds: 3 * 3600 + 720 }))).toEqual({ usedHours: 3.2, leftHours: 36.8, out: false });
    expect(hoursLeft(a({ usedSeconds: 50 * 3600 })).leftHours).toBe(0);
  });
});
