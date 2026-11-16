import { describe, expect, it } from "vitest";
import { BOOST_EVERY_DAYS, REASONS, STAY_CREDITS, STAY_WORDS, boostLive, canOfferBoost, cleanDetail, detailRequired, isReason } from "./core";

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
  it("is credits, said plainly", () => {
    expect(STAY_CREDITS).toBe(450);
    expect(STAY_WORDS).toBe("450 extra AI credits");
  });
  it("keeps its ceiling room only until its date", () => {
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
