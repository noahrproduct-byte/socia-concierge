import { describe, expect, it } from "vitest";
import { planStage, stageWord } from "./planStage";
import { shotMove } from "./shotMove";
import { sanitizePlanItems } from "./planItems";

describe("planStage", () => {
  it("counts the steps done", () => {
    expect(planStage({})).toBe(1);
    expect(planStage({ made: { step: "filmed", at: "2026-11-21T00:00:00Z" } })).toBe(2);
    expect(planStage({ made: { step: "edited", at: "2026-11-21T00:00:00Z" } }, "draft")).toBe(3);
    expect(planStage({}, "scheduled")).toBe(4);
    expect(stageWord(4, "published")).toBe("Posted");
    expect(stageWord(4, "scheduled")).toBe("Scheduled");
  });
  it("survives a save, in its exact shape only", () => {
    const base = { day: "Tuesday", concept: "c", hook: "h", format: "Reel", rationale: "", evidence: "", predictedPerformance: "" };
    expect(sanitizePlanItems([{ ...base, made: { step: "filmed", at: "2026-11-21T00:00:00Z" } }])[0].made).toEqual({ step: "filmed", at: "2026-11-21T00:00:00Z" });
    expect(sanitizePlanItems([{ ...base, made: { step: "posted" } }])[0].made).toBeUndefined();
  });
});

describe("shotMove", () => {
  it("reads the move from the shot's words", () => {
    expect(shotMove("You walk into frame toward the phone at chest height")).toBe("walk");
    expect(shotMove("Screen recording scrolling the pizza spot's Reels")).toBe("screen");
    expect(shotMove("Quick cuts of the footage you already shot")).toBe("cuts");
    expect(shotMove("The camera tilts down to the plate")).toBe("tilt");
    expect(shotMove("Back to you in the same medium shot, static")).toBe("still");
  });
});
