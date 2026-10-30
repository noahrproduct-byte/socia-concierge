import { describe, it, expect } from "vitest";
import { sanitizePlanItems } from "./planItems";
import { decisionsBlock } from "./planEvidence";
import { buildUserPrompt } from "./prompt";

const day = { day: "Friday", concept: "Dough to box in one take", hook: "Watch Friday", format: "Reel", rationale: "r", evidence: "e", predictedPerformance: "p" };

describe("decisions sent back by the browser", () => {
  it("keep a valid decision and an own idea, and drop anything else", () => {
    const [a, b, c] = sanitizePlanItems([
      { ...day, decision: { status: "rejected", at: "2026-10-30T10:00:00Z", reasons: ["hard_to_film", "made_up"], note: "No tripod — yet", extra: 1 } },
      { ...day, day: "Monday", source: "own", decision: { status: "approved", at: "2026-10-30T10:00:00Z", reasons: ["repetitive"] } },
      { ...day, day: "Tuesday", source: "elsewhere", decision: { status: "maybe" } },
    ]);
    expect(a.decision).toEqual({ status: "rejected", at: "2026-10-30T10:00:00Z", reasons: ["hard_to_film"], note: "No tripod , yet" });
    expect(b.source).toBe("own");
    expect(b.decision).toEqual({ status: "approved", at: "2026-10-30T10:00:00Z" });
    expect(c.source).toBeUndefined();
    expect(c.decision).toBeUndefined();
  });
});

describe("the next plan learns from them", () => {
  const plans = [{ created_at: "2026-10-30", data: { weeklyPlan: [
    { ...day, title: "Friday special", decision: { status: "rejected" as const, at: "x", reasons: ["hard_to_film"], note: "No tripod" } },
    { ...day, day: "Monday", concept: "Staff answer a question", decision: { status: "approved" as const, at: "x" } },
    { ...day, day: "Sunday", concept: "Sunday family table", source: "own" as const },
    { ...day, day: "Tuesday", concept: "Undecided idea" },
  ] } }];

  it("lists turned-down ideas with their reasons, approved ones and their own", () => {
    const b = decisionsBlock(plans);
    expect(b).toMatch(/Ideas they turned down:\n- "Friday special" \(Reel\): Too difficult to film; "No tripod"/);
    expect(b).toMatch(/Ideas they approved:\n- "Staff answer a question"/);
    expect(b).toMatch(/Ideas they added themselves:\n- "Sunday family table"/);
    expect(b).not.toMatch(/Undecided idea/);
    expect(decisionsBlock([])).toBe("");
  });

  it("tells the plan writer never to repeat a turned-down idea and to act on each reason", () => {
    const prompt = buildUserPrompt({ competitors: "", recentPosts: "", audienceWindows: "", brandVoice: "", clientHandle: "a", goal: "", niche: "b", platform: "instagram" } as never, null, { postsBlock: "", competitorsBlock: "", outcomesBlock: "", formatsBlock: "", decisionsBlock: decisionsBlock(plans), experimentsBlock: "", used: {} as never });
    expect(prompt).toMatch(/# What the person approved, turned down and added/);
    expect(prompt).toMatch(/Never propose a turned-down idea again/);
    expect(prompt).toMatch(/"Too difficult to film" means simpler production/);
  });
});
