import { describe, expect, it } from "vitest";
import { PLANS } from "@/lib/plans";
import { BONUS_CAP_USD, BONUS_DAYS, MAX_ACTIVE, bonusCapUsd, bonusFor, bonusLive, canClaim, cleanCode, makeCode, withBonus, type ReferralRow } from "./core";

const now = new Date("2026-11-20T12:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
const row = (referrer: string, referred: string, created: number, qualified: number | null): ReferralRow => ({ referrer_id: referrer, referred_id: referred, created_at: ago(created), qualified_at: qualified == null ? null : ago(qualified) });

describe("invite codes", () => {
  it("accepts only a real code, whatever its case", () => {
    expect(cleanCode(" AbC234xy ")).toBe("abc234xy");
    expect(cleanCode("abc")).toBeNull();
    expect(cleanCode("abc234xy; drop")).toBeNull();
    expect(cleanCode(undefined)).toBeNull();
  });
  it("makes eight unambiguous characters", () => {
    const code = makeCode(Uint8Array.from([0, 1, 2, 3, 250, 251, 252, 253]));
    expect(code).toMatch(/^[a-hj-km-np-z2-9]{8}$/);
    expect(cleanCode(code)).toBe(code);
  });
});

describe("what a person has from invitations", () => {
  it("counts a friend who connected, for both people, for thirty days", () => {
    const rows = [row("me", "amy", 5, 3)];
    expect(bonusFor(rows, "me", now)).toMatchObject({ active: 1, pending: false });
    expect(bonusFor(rows, "amy", now).active).toBe(1);
    expect(new Date(bonusFor(rows, "me", now).until!).getTime()).toBe(new Date(ago(3)).getTime() + BONUS_DAYS * 86_400_000);
    expect(bonusFor([row("me", "amy", 40, 31)], "me", now)).toEqual({ active: 0, until: null, pending: false });
  });
  it("doesn't count a friend who hasn't connected, and keeps waiting for sixty days", () => {
    expect(bonusFor([row("me", "amy", 2, null)], "me", now)).toEqual({ active: 0, until: null, pending: true });
    expect(bonusFor([row("me", "amy", 61, null)], "me", now).pending).toBe(false);
  });
  it("counts at most five at once and ignores other people's invitations", () => {
    const rows = ["a", "b", "c", "d", "e", "f", "g"].map((f, i) => row("me", f, 10, i + 1));
    expect(bonusFor(rows, "me", now).active).toBe(MAX_ACTIVE);
    expect(bonusFor([row("zed", "amy", 5, 3)], "me", now).active).toBe(0);
  });
  it("stops counting a saved bonus when its time is up", () => {
    expect(bonusLive({ active: 2, until: ago(-1) }, now)).toBe(2);
    expect(bonusLive({ active: 2, until: ago(1) }, now)).toBe(0);
    expect(bonusLive({ active: 9, until: ago(-1) }, now)).toBe(MAX_ACTIVE);
    expect(bonusLive(null, now)).toBe(0);
  });
});

describe("what an invitation adds", () => {
  it("adds questions and a plan on top of the plan's own allowances", () => {
    const free = withBonus(PLANS.free, 2);
    expect(free.meters.ask_socia).toBe(PLANS.free.meters.ask_socia + 20);
    expect(free.meters.content_plan).toBe(PLANS.free.meters.content_plan + 2);
    expect(free.meters.content_studio).toBe(PLANS.free.meters.content_studio);
    expect(PLANS.free.meters.ask_socia).toBe(10);
    expect(withBonus(PLANS.free, 0)).toBe(PLANS.free);
  });
  it("never opens something the plan doesn't include", () => {
    expect(withBonus(PLANS.free, 5).meters.animated_videos).toBe(0);
    expect(withBonus(PLANS.free, 5).meters.voiceovers).toBe(0);
  });
  it("adds bounded room to the month's AI ceiling", () => {
    expect(bonusCapUsd(1)).toBe(BONUS_CAP_USD);
    expect(bonusCapUsd(99)).toBe(MAX_ACTIVE * BONUS_CAP_USD);
    expect(bonusCapUsd(-3)).toBe(0);
  });
  it("lets only a new account use an invite link", () => {
    expect(canClaim(ago(1), now)).toBe(true);
    expect(canClaim(ago(8), now)).toBe(false);
    expect(canClaim(null, now)).toBe(false);
  });
});
