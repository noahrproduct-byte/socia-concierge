import { describe, it, expect } from "vitest";
import { GUIDE_SYSTEM, conceptFromFormat, conceptFromIdea, conceptFromPlanItem, conceptPrompt, guideText, normalizeGuide, sanitizeGuide } from "./studioGuide";
import { sanitizePlanItems } from "./planItems";
import type { NicheFormat } from "./nicheFormats";

const now = new Date("2026-10-30T12:00:00Z");
const raw = {
  length_sec: 9999,
  structure: ["Hook", "Build", "Payoff", "CTA"],
  hooks: [{ style: "curiosity", text: "This is what Friday smells like — really" }, { style: "direct", text: "" }, { style: "story", text: "At 5 AM the oven is already hot" }],
  script: [{ beat: "Hook", line: "Dough hits the counter", seconds: 3 }, { beat: "Build", line: "Stretch and top", seconds: -4 }],
  shots: [{ shot: "Overhead of the counter", framing: "overhead", seconds: 5, notes: "Phone on a stand" }, { shot: "", framing: "x", seconds: 1, notes: "" }],
  filming: ["Window light", "Two takes"], editing: ["Cut on each step"], caption: "Friday is here. #pizza", ctas: ["Order by 6"],
};

describe("the production guide is bounded before anyone sees it", () => {
  const g = normalizeGuide(raw, now);
  it("caps the length, drops empty hooks and shots, and keeps sane seconds", () => {
    expect(g.length_sec).toBe(600);
    expect(g.hooks.map((h) => h.style)).toEqual(["curiosity", "story"]);
    expect(g.hooks[0].text).not.toMatch(/—/);
    expect(g.script[1].seconds).toBeNull();
    expect(g.shots).toHaveLength(1);
    expect(g.edited_at).toBeNull();
  });

  it("accepts edits only as a guide, and keeps when it was written and edited", () => {
    expect(sanitizeGuide({ hooks: [] }, now)).toBeNull();
    const back = sanitizeGuide({ ...g, generated_at: "2026-10-01T00:00:00Z", edited_at: "2026-10-02T00:00:00Z", caption: "x".repeat(5000) }, now)!;
    expect(back.generated_at).toBe("2026-10-01T00:00:00Z");
    expect(back.edited_at).toBe("2026-10-02T00:00:00Z");
    expect(back.caption.length).toBe(2200);
  });

  it("travels with its planned post through the plan's sanitizer", () => {
    const [item] = sanitizePlanItems([{ day: "Friday", concept: "c", hook: "h", format: "Reel", rationale: "", evidence: "", predictedPerformance: "", guide: g }]);
    expect(item.guide?.hooks).toHaveLength(2);
  });

  it("reads as plain text for Copy", () => {
    const text = guideText(conceptFromIdea("Friday special from dough to box", "Reel", "Instagram", null), g);
    expect(text).toMatch(/^Friday special from dough to box\n\nHooks:\n- /);
    expect(text).toMatch(/Shots:\n1\. Overhead of the counter, overhead, 5s\. Phone on a stand/);
  });
});

describe("the concept comes from SOCIA's records", () => {
  it("from a planned post: its reasoning, audience, success measure and evidence", () => {
    const c = conceptFromPlanItem({ day: "Friday", title: "Dough to box", concept: "One take", hook: "h", format: "Reel", rationale: "Kitchen Reels beat your median", evidence: "1.8x across 6 posts", predictedPerformance: "", purpose: "Pillar: Behind the oven", audience: "Families nearby", successMetric: "Saves against your median", platform: "Instagram" }, "plan-1", "Gain followers");
    expect(c).toMatchObject({ source: "plan", title: "Dough to box", goal: "Gain followers", audience: "Families nearby", research: ["1.8x across 6 posts"], planId: "plan-1", day: "Friday" });
    expect(c.reasoning).toBe("Pillar: Behind the oven. Kitchen Reels beat your median");
  });

  it("from a Discover format: its basis and examples, and the brief says adapt, never copy", () => {
    const f = { name: "One-take build", summary: "A dish made start to finish.", steps: [], hooks: [], filming: [], lengthSuggestion: null, adaptations: ["Film the Friday special"], examples: [{ id: 0, url: "u", platform: "youtube", account: "Pizza Lab", title: "Neapolitan in one take", thumb: null, publishedAt: null, views: 1, likes: null, comments: null, durationSec: null, multiplier: 2.4 }], stats: { examples: 3, accounts: 2, withBaseline: 3, aboveBaseline: 3, medianMultiplier: 1.8, length: null }, leads: true } as NicheFormat;
    const c = conceptFromFormat(f, null);
    expect(c.concept).toBe("Film the Friday special");
    expect(c.research[0]).toMatch(/3 examples from 2 accounts/);
    expect(c.research[1]).toBe("Pizza Lab: Neapolitan in one take (2.4x their usual)");
    expect(conceptPrompt(c)).toMatch(/never copy a creator's video/);
  });

  it("keeps production within what the person has", () => {
    expect(GUIDE_SYSTEM).toMatch(/Never ask for gear, skills or people they don't have/);
  });
});
