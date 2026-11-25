import { describe, expect, it } from "vitest";
import { DEFAULT_CREATIVE, asksText, aspectSize, composeBrief, creativeSummary, recommend, themePatch, withRecommendation, type Creative, type CreativeKey } from "./creative";
import { THEMES } from "./themes";
import { setThemeOverride, applyTheme, resolveTheme } from "./themes/apply";
import type { Edl } from "./types";

describe("recommend", () => {
  it("sets nothing without anything to go on", () => {
    expect(recommend({})).toEqual({ creative: {}, reasons: [] });
  });

  it("reads the pace and length from the reference's real cuts", () => {
    const r = recommend({ reference: { durationSec: 12, cuts: [1, 2, 3, 4, 5, 6, 7, 8], speech: false } });
    expect(r.creative.pace).toBe("fast");
    expect(r.creative.durationSec).toBe(15);
    expect(r.reasons.join(" ")).toMatch(/9 shots in 12 seconds/);
  });

  it("lets the prompt's words win over the reference", () => {
    const r = recommend({ prompt: "A calm, cinematic 30 second video, no captions", reference: { durationSec: 10, cuts: [1, 2, 3, 4, 5, 6, 7, 8, 9], speech: true } });
    expect(r.creative.pace).toBe("calm");
    expect(r.creative.colour).toBe("cinematic");
    expect(r.creative.captions).toBe("off");
    expect(r.creative.durationSec).toBe(30);
  });

  it("puts the person first for one talking clip", () => {
    expect(recommend({ clips: { count: 1 } }).creative.focus).toBe("person");
    expect(recommend({ clips: { count: 3 } }).creative.focus).toBeUndefined();
  });

  it("follows a style chosen in Ask SOCIA", () => {
    const r = recommend({ style: "fast_explainer" });
    expect(r.creative).toMatchObject({ pace: "fast", graphics: "lots", focus: "balanced" });
  });
});

describe("withRecommendation", () => {
  it("never moves a setting the person changed", () => {
    const current: Creative = { ...DEFAULT_CREATIVE, pace: "calm", aspect: "1:1" };
    const next = withRecommendation(current, { pace: "fast", colour: "bright" }, new Set<CreativeKey>(["pace"]));
    expect(next.pace).toBe("calm");
    expect(next.colour).toBe("bright");
    expect(next.aspect).toBe("1:1");
  });

  it("drops an old recommendation the new one doesn't make", () => {
    const current: Creative = { ...DEFAULT_CREATIVE, colour: "cinematic" };
    expect(withRecommendation(current, {}, new Set()).colour).toBe("style");
  });
});

describe("the brief", () => {
  it("says nothing when SOCIA decides everything", () => {
    expect(asksText(DEFAULT_CREATIVE)).toBe("");
    expect(composeBrief("Make a pizza ad", DEFAULT_CREATIVE)).toBe("Make a pizza ad");
  });

  it("keeps the asks whole when the prompt is long", () => {
    const c: Creative = { ...DEFAULT_CREATIVE, durationSec: 30, pace: "fast" };
    const out = composeBrief("word ".repeat(200), c, 300);
    expect(out.length).toBeLessThanOrEqual(300);
    expect(out).toMatch(/about 30 seconds long\. Fast pace/);
  });
});

describe("the look", () => {
  it("leaves the theme alone by default", () => {
    expect(themePatch(DEFAULT_CREATIVE)).toBeNull();
  });

  it("is a change the theme accepts, applied the way the editor applies it", () => {
    const theme = THEMES[0];
    const base: Edl = {
      version: 1, fps: 30, width: 1080, height: 1920, targetSec: { min: 10, max: 30 },
      segments: [{ id: "a", clipId: "c", in: 0, out: 3, role: "opener", note: "" }, { id: "b", clipId: "c", in: 4, out: 7, role: "body", note: "" }],
      text: [], captions: { source: "transcript" }, enhance: [], audio: [], cta: null, music: null, caption: "", notes: [],
    };
    const themed = applyTheme(base, theme);
    const patch = themePatch({ ...DEFAULT_CREATIVE, captions: "pop", captionAnim: "rise", transition: "fade", colour: "cinematic" })!;
    const out = setThemeOverride(themed, patch);
    expect(out.style?.captions.preset).toBe("pop");
    expect(out.style?.captions.animation).toBe("rise");
    expect(out.segments[1].transition).toBe("fade");
    expect(resolveTheme(out)?.color.grade.warmth).toBe(0.35);
    expect(out.theme?.id).toBe(theme.id);
  });

  it("turns captions off through the theme", () => {
    const patch = themePatch({ ...DEFAULT_CREATIVE, captions: "off", captionAnim: "pop" })!;
    expect(patch).toEqual({ typography: { captions: false } });
  });

  it("sizes the frame", () => {
    expect(aspectSize("4:5")).toEqual({ width: 1080, height: 1350 });
  });

  it("summarises only what isn't left to the style", () => {
    expect(creativeSummary(DEFAULT_CREATIVE, "Showroom")).toBe("Showroom");
    expect(creativeSummary({ ...DEFAULT_CREATIVE, pace: "fast", durationSec: 30 }, "Showroom")).toBe("Showroom · Fast pace · about 30 s");
  });
});
