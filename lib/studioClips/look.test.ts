import { describe, expect, it } from "vitest";
import { letterboxPx, lookCssFilter, lookPlan } from "./look";
import { THEMES } from "./themes";

describe("lookPlan", () => {
  it("a neutral grade adds nothing", () => {
    expect(lookPlan({ contrast: 1, saturation: 1, warmth: 0, vignette: 0, grain: 0, chroma: 0, scanlines: 0, letterbox: 0 }, 0, 1080)).toEqual([]);
    expect(lookPlan(null, 0, 1080)).toEqual([]);
  });
  it("the Retro theme grades, grains, splits the chroma and scanlines; grain re-rolls every other frame", () => {
    const g = THEMES.find((t) => t.id === "retro")!.color.grade;
    const kinds = lookPlan(g, 0, 1080).map((s) => s.kind);
    expect(kinds).toEqual(["color", "vignette", "grain", "chroma", "scanlines"]);
    const a = lookPlan(g, 0, 1080).find((s) => s.kind === "grain"), b = lookPlan(g, 1, 1080).find((s) => s.kind === "grain"), c = lookPlan(g, 2, 1080).find((s) => s.kind === "grain");
    expect(a).toEqual(b); expect(a).not.toEqual(c);
    // Chroma scales with the frame width.
    expect((lookPlan(g, 0, 540).find((s) => s.kind === "chroma") as { amount: number }).amount).toBeCloseTo(2, 5);
  });
  it("the Cinematic theme has letterbox bars and a warm colour pass", () => {
    const g = THEMES.find((t) => t.id === "cinematic")!.color.grade;
    expect(letterboxPx(g, 1920)).toBe(173);
    const color = lookPlan(g, 0, 1080).find((s) => s.kind === "color") as { params: { temperature: number } };
    expect(color.params.temperature).toBeGreaterThan(0);
    expect(lookCssFilter(g)).toContain("sepia");
  });
});
