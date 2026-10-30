import { describe, it, expect } from "vitest";
import { normalizePlanItem, platformName, sanitizePlanItems } from "./planItems";
import { buildUserPrompt, SYSTEM } from "./prompt";
import { deliverableSchema } from "./schema";

const base = { day: "Friday", concept: "The Friday special from dough to box", hook: "Watch Friday happen", format: "Reel", rationale: "Kitchen Reels beat your median", evidence: "1.8x across 6 posts", predictedPerformance: "Above your median" };

describe("plan item fields", () => {
  it("asks the model for every per-post field the brief lists", () => {
    const items = (deliverableSchema.properties.weeklyPlan as { items: { required: string[] } }).items.required;
    for (const k of ["title", "purpose", "audience", "platform", "direction", "production", "successMetric"]) expect(items).toContain(k);
    expect(SYSTEM).toMatch(/never more equipment, editing skill or help than they said they have/);
  });

  it("maps the platform to one SOCIA publishes to, and drops one it doesn't", () => {
    expect(platformName("instagram reels")).toBe("Instagram");
    expect(platformName("YouTube Shorts")).toBe("YouTube");
    expect(platformName("LinkedIn")).toBeNull();
    expect(normalizePlanItem({ ...base, platform: "Pinterest" }).platform).toBeUndefined();
  });

  it("bounds the new fields and strips em dashes", () => {
    const n = normalizePlanItem({ ...base, title: `Dough to box — Friday ${"x".repeat(200)}`, successMetric: "  " });
    expect(n.title!.length).toBeLessThanOrEqual(80);
    expect(n.title).not.toMatch(/—/);
    expect(n.successMetric).toBeUndefined();
  });
});

describe("edits sent back by the browser", () => {
  it("keep known fields only, bounded, and drop days without a concept", () => {
    const out = sanitizePlanItems([{ ...base, injected: "<script>", concept: "c".repeat(5000) }, { day: "Monday", concept: "" }, "junk", null]);
    expect(out).toHaveLength(1);
    expect(Object.keys(out[0])).not.toContain("injected");
    expect(out[0].concept.length).toBe(1200);
  });
});

describe("older plans", () => {
  it("still build a prompt and render without the new fields", () => {
    expect(normalizePlanItem(base).title).toBeUndefined();
    expect(buildUserPrompt({ competitors: "", recentPosts: "", audienceWindows: "", brandVoice: "", clientHandle: "a", goal: "", niche: "b", platform: "instagram" } as never)).toMatch(/# My account/);
  });
});
