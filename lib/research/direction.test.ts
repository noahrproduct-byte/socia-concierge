import { describe, expect, it } from "vitest";
import { directionBlock, directionFromText, lettersIn, sanitizeDirection, type DirectionRef } from "./direction";
import { buildResearch } from "./answer";
import { rankExamples, type ResearchExample } from "./examples";
import { prefsLine, withChoice } from "../creativePrefs";

const gallery: DirectionRef[] = [
  { letter: "A", style: "talking_head_story", title: "Founder story", creator: "Ann", url: "https://youtube.com/shorts/a", techniques: ["Problem first"] },
  { letter: "B", style: "product_demo", title: "App demo", creator: "Bo", url: "https://youtube.com/shorts/b", techniques: [] },
  { letter: "C", style: "fast_explainer", title: "Fast tips", creator: "Cy", url: "https://youtube.com/shorts/c", techniques: [] },
];

describe("choosing from the gallery in words", () => {
  it("\"I like option B\" picks B", () => {
    expect(directionFromText("I like option B", gallery)).toEqual({ kind: "reference", refs: [gallery[1]] });
  });
  it("\"combine A and C\" combines two", () => {
    expect(directionFromText("Combine A and C please", gallery)).toMatchObject({ kind: "combined", refs: [gallery[0], gallery[2]] });
  });
  it("a sentence that isn't a pick picks nothing", () => {
    expect(lettersIn("Make it a bit more storytelling")).toEqual([]);
    expect(directionFromText("Write a caption for a video", gallery)).toBeNull();
  });
  it("a letter not in the gallery picks nothing", () => {
    expect(directionFromText("go with D", gallery)).toBeNull();
  });
});

describe("sanitizeDirection", () => {
  it("keeps a valid choice and refuses junk", () => {
    expect(sanitizeDirection({ kind: "reference", refs: [gallery[0]] })?.refs[0].style).toBe("talking_head_story");
    expect(sanitizeDirection({ kind: "reference", refs: [{ ...gallery[0], url: "javascript:alert(1)" }] })).toBeNull();
    expect(sanitizeDirection({ kind: "combined", refs: [gallery[0]] })).toBeNull();
    expect(sanitizeDirection({ kind: "own", refs: [], own: "  calm, one take  " })).toEqual({ kind: "own", refs: [], own: "calm, one take" });
    expect(sanitizeDirection({ kind: "hack" })).toBeNull();
  });
});

describe("directionBlock", () => {
  it("tells the writer to keep the style for the whole chat and never copy the reference", () => {
    const b = directionBlock({ kind: "reference", refs: [gallery[0]] });
    expect(b).toContain("Talking-head story");
    expect(b).toContain("Problem first");
    expect(b).toMatch(/keep it for every answer/);
    expect(b).toMatch(/Never copy the reference's script, footage, branding/);
    expect(b).toMatch(/Don't show reference examples again/);
  });
});

describe("the gallery's examples", () => {
  const now = new Date("2026-11-19T12:00:00Z");
  const ex = (i: number): ResearchExample => ({ ref: "", source: "youtube", platform: "youtube", url: `https://youtube.com/shorts/v${i}`, title: `Founder pitch ${i}`, creator: `C${i}`, thumb: null, views: 1000 * i, likes: null, comments: null, durationSec: 30, publishedAt: "2026-10-01T00:00:00Z", vsUsual: null, usualBasis: null, foundBy: "t" });
  const found = rankExamples([1, 2, 3, 4, 5].map(ex), { topic: "founder pitch", now, freshDays: 365, shortOnly: true, max: 10 });
  it("are lettered A to D, one per style, never two in the same style", () => {
    const r = buildResearch({
      raw: { approach: "a", why: "", test: "", steps: [], examples: [
        { ref: "R1", why: "w", style: "talking_head_story", techniques: ["Opens on the problem", "1.2M views"] },
        { ref: "R2", why: "w", style: "talking_head_story", techniques: [] },
        { ref: "R3", why: "w", style: "product_demo", techniques: [] },
        { ref: "R4", why: "w", style: "bogus" as never, techniques: [] },
        { ref: "R5", why: "w", style: "fast_explainer", techniques: [] },
      ] },
      kind: "create_content", examples: found, notes: [], seed: "a", clean: (s) => s,
    })!;
    expect(r.examples.map((x) => [x.letter, x.style])).toEqual([["A", "talking_head_story"], ["B", "product_demo"], ["C", "fast_explainer"]]);
    expect(r.examples[0].techniques).toEqual(["Opens on the problem"]);
  });
});

describe("creative preferences", () => {
  it("counts each chosen style and names the favourites without calling them proven", () => {
    const now = new Date("2026-11-19T12:00:00Z");
    const p = withChoice(withChoice(null, ["product_demo"], now), ["product_demo", "fast_explainer"], now);
    expect(p.styles).toEqual({ product_demo: 2, fast_explainer: 1 });
    expect(prefsLine(p)).toMatch(/^Creative styles this person has chosen before in Ask SOCIA: Product demonstration \(2 times\), Fast-paced explainer \(1 time\)\. A preference, not proof/);
    expect(prefsLine(null)).toBe("");
  });
});
