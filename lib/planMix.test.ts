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
  it("a posting target sets the number of posts, in the last plan's proportions", () => {
    expect(defaultMix({ lastPlan: [{}, {}, {}, {}, {}], target: 3 })).toEqual({ onCamera: 3, animated: 0, animatedLed: false, from: "routine", target: 3 });
    const mixed = [{ animated: true }, { animated: true }, {}, {}];
    expect(defaultMix({ lastPlan: mixed, target: 6 })).toMatchObject({ onCamera: 3, animated: 3, from: "routine" });
    expect(defaultMix({ lastPlan: [{ animated: true }, {}, {}, {}, {}], target: 2 })).toMatchObject({ onCamera: 2, animated: 0, animatedLed: false });
  });
  it("a last plan that already matches the target is the last plan", () => {
    expect(defaultMix({ lastPlan: [{}, {}, {}], target: 3 })).toEqual({ onCamera: 3, animated: 0, animatedLed: false, from: "last_plan" });
  });
  it("a last plan with more than one post a day is not cut down to the target", () => {
    const twoADay = [...Array(14)].map(() => ({ animated: true }));
    expect(defaultMix({ lastPlan: twoADay, target: 7 })).toMatchObject({ animated: 14, from: "last_plan" });
  });
  it("without a plan, the target replaces the pace and sets the animated days", () => {
    expect(defaultMix({ pace: 5, target: 2 })).toEqual({ onCamera: 2, animated: 0, animatedLed: false, from: "routine", target: 2 });
    expect(defaultMix({ animatedPref: { on: true, perDay: 2 }, target: 3 })).toMatchObject({ onCamera: 0, animated: 6, animatedLed: true, from: "routine" });
    expect(defaultMix({ lastPlan: [{ animated: true }, {}], animatedAllowed: false, target: 4 })).toMatchObject({ onCamera: 4, animated: 0 });
  });
  it("ignores a target that is not a real number of days", () => {
    expect(defaultMix({ pace: 4, target: 0 })).toMatchObject({ onCamera: 4, from: "default" });
    expect(defaultMix({ pace: 4, target: null })).toMatchObject({ onCamera: 4, from: "default" });
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
