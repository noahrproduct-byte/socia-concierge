import { describe, it, expect } from "vitest";
import { needsOnboarding, nextStep, prevStep, resumeStep } from "./onboarding";

describe("needsOnboarding", () => {
  const row = (completed: boolean) => ({ step: "goals", answers: {}, completed_at: completed ? "2026-10-29T10:00:00Z" : null });

  it("never sends an invited Admin or Member", () => {
    expect(needsOnboarding({ isOwner: false, row: row(false), tableReady: true, niche: null })).toBe(false);
  });

  it("follows the saved progress when there is a row", () => {
    expect(needsOnboarding({ isOwner: true, row: row(false), tableReady: true, niche: "Food & Restaurant" })).toBe(true);
    expect(needsOnboarding({ isOwner: true, row: row(true), tableReady: true, niche: null })).toBe(false);
  });

  it("without a row, people who set a niche in the old onboarding aren't sent again", () => {
    expect(needsOnboarding({ isOwner: true, row: null, tableReady: true, niche: "Food & Restaurant" })).toBe(false);
    expect(needsOnboarding({ isOwner: true, row: null, tableReady: true, niche: null })).toBe(true);
    expect(needsOnboarding({ isOwner: true, row: null, tableReady: false, niche: null })).toBe(true);
  });
});

describe("steps", () => {
  it("move within bounds and resume at the saved step", () => {
    expect(nextStep("connect")).toBe("account");
    expect(nextStep("briefing")).toBe("briefing");
    expect(prevStep("connect")).toBe("connect");
    expect(resumeStep({ step: "voice", answers: {}, completed_at: null })).toBe("voice");
    expect(resumeStep({ step: "nonsense", answers: {}, completed_at: null })).toBe("connect");
    expect(resumeStep(null)).toBe("connect");
  });
});
