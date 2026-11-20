import { describe, expect, it } from "vitest";
import { DEFAULT_DIRECTION, directionFor, directionSummary, directionText, withDirection } from "./editDirection";
import { PROMPT_MAX } from "./reference";
import { briefIntent } from "./briefIntent";

describe("the editor's creative direction", () => {
  it("starts from sensible defaults, and from the style chosen in Ask SOCIA when there is one", () => {
    expect(directionFor(null)).toEqual(DEFAULT_DIRECTION);
    expect(directionFor("fast_explainer")).toMatchObject({ pace: "fast", captions: "word", transitions: "punchy" });
    expect(directionFor("talking_head_story")).toMatchObject({ lead: "person", animation: "none" });
  });

  it("becomes plain instructions for the cut", () => {
    const t = directionText(directionFor("product_demo"));
    expect(t).toMatch(/^Creative direction: /);
    expect(t).toContain("Lead with the screen recording or the product");
    expect(t).toContain("A calm music bed under the voice.");
  });

  it("is added to the brief without going over the editor's limit, the brief giving way", () => {
    const long = "word ".repeat(600);
    const out = withDirection(long, DEFAULT_DIRECTION);
    expect(out.length).toBeLessThanOrEqual(PROMPT_MAX);
    expect(out.endsWith(directionText(DEFAULT_DIRECTION))).toBe(true);
    expect(withDirection("", DEFAULT_DIRECTION)).toBe(directionText(DEFAULT_DIRECTION));
    expect(withDirection("Keep it short", null)).toBe("Keep it short");
  });

  it("turns music and captions on only when they are chosen (the editor reads those words as asks)", () => {
    const off = directionText({ ...DEFAULT_DIRECTION, music: "none", captions: "none" });
    expect(briefIntent(off)).toMatchObject({ music: false, captions: false });
    expect(briefIntent(directionText({ ...DEFAULT_DIRECTION, music: "upbeat", captions: "bold" }))).toMatchObject({ music: true, captions: true });
  });

  it("summarises the choices in one line", () => {
    expect(directionSummary(DEFAULT_DIRECTION)).toBe("Steady · Bold key words · Subtle · Hard cuts · No music · Balanced · Natural");
  });
});
