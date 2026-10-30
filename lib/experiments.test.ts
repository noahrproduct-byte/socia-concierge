import { describe, it, expect } from "vitest";
import { evaluateExperiment, experimentsEvidence, type ExperimentTest } from "./experiments";
import { applyEdits, normalizeStrategy, strategyLines, running } from "./strategy";
import { normalizePlanItem } from "./planItems";
import { buildUserPrompt } from "./prompt";

const t = (multiplier: number | null, over: Partial<ExperimentTest> = {}): ExperimentTest => ({ planId: "p", planCreatedAt: "2026-10-01", day: "Friday", title: "Staff Reel", state: "published", permalink: null, multiplier, early: false, ...over });

describe("an experiment's verdict is arithmetic over settled results", () => {
  it("is too early under three settled posts, and says what to do", () => {
    const r = evaluateExperiment([t(1.8), t(2.1, { early: true }), t(null, { state: "scheduled" })]);
    expect(r).toMatchObject({ planned: 3, published: 2, measured: 1, verdict: "too_early" });
    expect(r.nextAction).toMatch(/Publish the 1 planned test post still waiting, then 1 more/);
  });

  it("is supported at a median of 1.2x or more with two thirds above the median", () => {
    const r = evaluateExperiment([t(1.6), t(1.3), t(0.9)]);
    expect(r.verdict).toBe("supported");
    expect(r.medianMultiplier).toBe(1.3);
    expect(r.interpretation).toMatch(/3 test posts measured: median 1.3x your median, 2 of 3 above it\. That supports/);
    expect(r.interpretation).toMatch(/small sample/);
  });

  it("is not supported below 0.9x, and mixed in between", () => {
    expect(evaluateExperiment([t(0.5), t(0.8), t(1.1)]).verdict).toBe("not_supported");
    expect(evaluateExperiment([t(1.0), t(1.1), t(0.95)]).verdict).toBe("mixed");
  });

  it("reads as evidence lines with the id, status and next step", () => {
    const line = experimentsEvidence([{ id: "eabc1", hypothesis: "Staff faces lift saves", status: "running", result: evaluateExperiment([]) }]);
    expect(line).toBe("- [eabc1] Staff faces lift saves (running). Too early: No post has tested it yet. Next: Plan 3 more test posts; the next weekly plan includes them.");
  });
});

describe("experiments carry ids from the strategy to the plan's test posts", () => {
  const now = new Date("2026-10-30T12:00:00Z");
  const s = normalizeStrategy({ experiments: [{ hypothesis: "Staff faces lift saves", test: "Two staff Reels", measure: "Saves" }], pillars: [], posts_per_week: 3 }, { growth: null, goalLine: null, basedOn: [], now });

  it("gives each new experiment an id and running status", () => {
    expect(s.experiments[0]).toMatchObject({ status: "running", started_at: now.toISOString() });
    expect(s.experiments[0].id).toMatch(/^e[0-9a-z]{3,14}$/);
    expect(strategyLines(s)).toMatch(new RegExp(`\\[${s.experiments[0].id}\\] Staff faces lift saves`));
  });

  it("keeps the id through edits, and only running experiments are planned for", () => {
    const later = new Date("2026-11-05T12:00:00Z");
    const e = applyEdits(s, { experiments: [{ ...s.experiments[0], status: "done" }, { hypothesis: "Local tags help", test: "Tag the location", measure: "Reach" }] }, later);
    expect(e.experiments[0].id).toBe(s.experiments[0].id);
    expect(e.experiments[0].status).toBe("done");
    expect(e.experiments[1].id).not.toBe(s.experiments[0].id);
    expect(running(e).map((x) => x.hypothesis)).toEqual(["Local tags help"]);
  });

  it("tags a planned post only with a real experiment id", () => {
    const base = { day: "Friday", concept: "c", hook: "h", format: "Reel", rationale: "", evidence: "", predictedPerformance: "" };
    expect(normalizePlanItem({ ...base, experiment: s.experiments[0].id }).experiment).toBe(s.experiments[0].id);
    expect(normalizePlanItem({ ...base, experiment: "the staff one" }).experiment).toBeUndefined();
  });

  it("tells the plan writer to tag test posts and to follow each experiment's next step", () => {
    const prompt = buildUserPrompt({ competitors: "", recentPosts: "", audienceWindows: "", brandVoice: "", clientHandle: "a", goal: "", niche: "b", platform: "instagram" } as never, { strategy: s }, { postsBlock: "", competitorsBlock: "", outcomesBlock: "", formatsBlock: "", decisionsBlock: "", experimentsBlock: "- [x] something", used: {} as never });
    expect(prompt).toMatch(/carries that experiment's id in its experiment field/);
    expect(prompt).toMatch(/# How the strategy's experiments are going/);
  });
});
