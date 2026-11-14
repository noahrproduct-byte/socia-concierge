import { describe, expect, it } from "vitest";
import { animatedSlots, defaultMix, mixOfPlan, resolveMix } from "./planMix";

describe("defaultMix", () => {
  it("follows the last plan's mix", () => {
    const last = [...Array(7)].map(() => ({ animated: true })).concat([{ animated: false }]);
    expect(defaultMix({ lastPlan: last })).toEqual({ onCamera: 1, animated: 7, animatedLed: true, from: "last_plan" });
  });
  it("an on-camera account stays on camera", () => {
    expect(defaultMix({ lastPlan: [{}, {}, {}, {}, {}] })).toMatchObject({ onCamera: 5, animated: 0, animatedLed: false });
  });
  it("without a plan, uses the animated setting, animated-led", () => {
    expect(defaultMix({ animatedPref: { on: true, perDay: 2 } })).toEqual({ onCamera: 0, animated: 14, animatedLed: true, from: "settings" });
  });
  it("without a plan or animated videos, uses the strategy's pace", () => {
    expect(defaultMix({ pace: 4 })).toEqual({ onCamera: 4, animated: 0, animatedLed: false, from: "default" });
  });
  it("no animated posts on a plan without animated videos", () => {
    expect(defaultMix({ lastPlan: [{ animated: true }, {}], animatedAllowed: false })).toMatchObject({ onCamera: 1, animated: 0 });
  });
});

describe("resolveMix", () => {
  const fallback = { onCamera: 5, animated: 0, animatedLed: false, from: "default" as const };
  it("keeps what was asked, within bounds", () => {
    expect(resolveMix({ onCamera: 3, animated: 4 }, fallback, true)).toEqual({ onCamera: 3, animated: 4 });
    expect(resolveMix({ onCamera: 99, animated: -2 }, fallback, true)).toEqual({ onCamera: 14, animated: 0 });
  });
  it("falls back when missing, drops animated when not allowed, and never plans zero posts", () => {
    expect(resolveMix({}, fallback, true)).toEqual({ onCamera: 5, animated: 0 });
    expect(resolveMix({ onCamera: 2, animated: 5 }, fallback, false)).toEqual({ onCamera: 2, animated: 0 });
    expect(resolveMix({ onCamera: 0, animated: 0 }, fallback, true)).toEqual({ onCamera: 1, animated: 0 });
  });
});

describe("animatedSlots", () => {
  it("spreads posts across the week", () => {
    expect(animatedSlots(3).map((s) => s.weekday)).toEqual([0, 2, 4]);
    expect(animatedSlots(7).map((s) => s.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
  it("adds a second a day past seven", () => {
    const s = animatedSlots(9);
    expect(s.filter((x) => x.slot === 2).map((x) => x.weekday)).toEqual([0, 3]);
    expect(s).toHaveLength(9);
  });
  it("counts kinds in a plan", () => {
    expect(mixOfPlan([{ animated: true }, {}, {}])).toEqual({ onCamera: 2, animated: 1 });
  });
});
