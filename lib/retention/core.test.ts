import { describe, expect, it } from "vitest";
import { PLANS } from "@/lib/plans";
import { BOOST_EVERY_DAYS, REASONS, STAY_BOOST, boostLines, boostLive, canOfferBoost, cleanDetail, detailRequired, isReason, withBoost } from "./core";

const now = new Date("2026-11-20T12:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

describe("why someone is cancelling", () => {
  it("has to be one of the listed reasons", () => {
    expect(REASONS.length).toBeGreaterThanOrEqual(6);
    for (const r of REASONS) expect(isReason(r.id)).toBe(true);
    expect(isReason("")).toBe(false);
    expect(isReason(undefined)).toBe(false);
    expect(isReason("because")).toBe(false);
  });
  it("asks for words only when the reason is something else", () => {
    expect(detailRequired("other")).toBe(true);
    expect(detailRequired("too_expensive")).toBe(false);
    expect(cleanDetail("  too   many\nsteps ")).toBe("too many steps");
    expect(cleanDetail("x".repeat(900)).length).toBe(500);
    expect(cleanDetail(42)).toBe("");
  });
});

describe("the offer for staying", () => {
  it("adds allowance on top of the plan's own", () => {
    const g = withBoost(PLANS.growth, true);
    expect(g.meters.ask_socia).toBe(PLANS.growth.meters.ask_socia + 25);
    expect(g.meters.content_plan).toBe(PLANS.growth.meters.content_plan + 2);
    expect(g.meters.animated_videos).toBe(PLANS.growth.meters.animated_videos + 10);
    expect(g.meters.content_studio).toBe(PLANS.growth.meters.content_studio);
    expect(withBoost(PLANS.growth, false)).toBe(PLANS.growth);
    expect(PLANS.growth.meters.ask_socia).toBe(200);
  });
  it("never opens something the plan doesn't include, and says only what it adds", () => {
    const free = withBoost(PLANS.free, true);
    expect(free.meters.animated_videos).toBe(0);
    expect(free.meters.voiceovers).toBe(0);
    expect(boostLines(PLANS.free)).toEqual(["25 more Ask SOCIA questions", "30 more hooks and captions", "2 more Content Plans"]);
    expect(boostLines(PLANS.starter)).toEqual(["25 more Ask SOCIA questions", "30 more hooks and captions", "2 more Content Plans", "10 more animated videos", "5 more voiceovers"]);
    expect(Object.keys(STAY_BOOST).length).toBe(5);
  });
  it("is on only until its date", () => {
    expect(boostLive(ago(-1), now)).toBe(true);
    expect(boostLive(ago(1), now)).toBe(false);
    expect(boostLive(null, now)).toBe(false);
  });
  it("can't be collected by starting to cancel every month", () => {
    expect(canOfferBoost(null, now)).toBe(true);
    expect(canOfferBoost(ago(30), now)).toBe(false);
    expect(canOfferBoost(ago(BOOST_EVERY_DAYS - 1), now)).toBe(false);
    expect(canOfferBoost(ago(BOOST_EVERY_DAYS), now)).toBe(true);
  });
});
