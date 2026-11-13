import { describe, expect, it } from "vitest";
import { applyTheme, motionForSegment, resetToTheme, resolveTheme, sentencePunches, setThemeOverride, styleFromTheme } from "./apply";
import { THEMES, themeById } from "./index";
import type { Edl, TranscriptWord } from "../types";

const w = (text: string, s: number, e: number): TranscriptWord => ({ text, startMs: s * 1000, endMs: e * 1000, confidence: 1 });
const words: TranscriptWord[] = [w("We", 0.2, 0.4), w("fed", 0.4, 0.7), w("two", 0.8, 1.0), w("hundred", 1.0, 1.4), w("people.", 1.4, 1.9), w("One", 2.6, 2.9), w("kitchen.", 2.9, 3.4), w("Twenty", 4.2, 4.6), w("a", 4.6, 4.7), w("day.", 4.7, 5.1)];

const edl: Edl = {
  version: 1, fps: 30, width: 1080, height: 1920, targetSec: { min: 5, max: 12 },
  segments: [{ id: "s1", clipId: "c1", in: 0, out: 6, role: "opener", note: "" }, { id: "s2", clipId: "c2", in: 1, out: 4, role: "body", note: "", transition: "whip", frame: { zoom: 1.2, x: 0.3, y: 0.4 } }, { id: "s3", clipId: "c1", in: 6, out: 9, role: "ending", note: "", motion: { shake: 0.9, locked: true } }],
  text: [{ id: "t1", at: 0, end: 2.5, text: "two hundred people, one kitchen", role: "opening", presetId: "hook_title" }, { id: "t2", at: 5, end: 8, text: "Book your event", role: "cta", presetId: "callout_box" }],
  captions: { source: "transcript" }, enhance: [], audio: [], cta: null, music: null, caption: "hello", notes: [], emphasis: ["hundred", "twenty"],
  soundtrack: { trackId: "k", name: "k", path: "p", musicVolume: 0.4, originalVolume: 1 },
};
const ctx = { words: { c1: words, c2: null } };

describe("applyTheme", () => {
  it("keeps the person's trims, order, words, captions and music; sets the style, the transitions and the motion", () => {
    const bold = themeById("bold-hook")!;
    const out = applyTheme(edl, bold, ctx);
    expect(out.segments.map((s) => [s.in, s.out])).toEqual(edl.segments.map((s) => [s.in, s.out]));
    expect(out.text.map((t) => t.text)).toEqual(["two hundred people, one kitchen", "Book your event"]);
    expect(out.captions).toEqual(edl.captions);
    expect(out.caption).toBe("hello");
    expect(out.soundtrack).toMatchObject({ trackId: "k", duck: true });
    expect(out.style).toEqual(styleFromTheme(bold));
    expect(out.style?.font).toBe("anton");
    expect(out.theme).toEqual({ id: "bold-hook" });
    // Hard cuts: the whip is gone.
    expect(out.segments[1].transition).toBeUndefined();
    // Alternating zoom: in on the first cut, out on the second, with the reframe's focus as the origin.
    expect(out.segments[0].motion?.zoom).toMatchObject({ from: 1, to: 1.08 });
    expect(out.segments[1].motion?.zoom).toMatchObject({ from: 1.08, to: 1, x: 0.3, y: 0.4 });
    // Word punches where the emphasised words are said.
    expect(out.segments[0].motion?.punch).toEqual({ at: [1, 4.2], amount: 0.1 });
    // A locked cut keeps its own motion.
    expect(out.segments[2].motion).toEqual({ shake: 0.9, locked: true });
    // Sentence steps on the talking cut.
    expect(out.segments[0].punches).toEqual([1.9, 3.4]);
  });
  it("the opening line takes the theme's title look", () => {
    const out = applyTheme(edl, themeById("cinematic")!, ctx);
    expect(out.text[0].presetId).toBe("hook_pair");
    expect(out.text[1].presetId).toBe("callout_box");
    expect(applyTheme(edl, themeById("retro")!, ctx).text[0].presetId).toBe("lower_third");
  });
  it("soft joins become the theme's transition; a theme without ducking removes it", () => {
    const out = applyTheme(edl, themeById("cinematic")!, ctx);
    expect(out.segments[1].transition).toBe("fade");
    expect(out.segments[0].transition).toBeUndefined();
    const nod = applyTheme(edl, { ...themeById("cinematic")!, audio: { ...themeById("cinematic")!.audio, duck: 1 } }, ctx);
    expect(nod.soundtrack?.duck).toBeUndefined();
  });
  it("every shipped theme applies without throwing and resolves back", () => {
    for (const t of THEMES) {
      const out = applyTheme(edl, t, ctx);
      expect(resolveTheme(out)?.id).toBe(t.id);
    }
  });
});

describe("overrides", () => {
  it("are stored as a diff and reset clears them", () => {
    const themed = applyTheme(edl, themeById("clean-minimal")!, ctx);
    const over = setThemeOverride(themed, { typography: { font: "bebas", captionPosition: "top" }, motion: { shake: 0.3 } }, ctx);
    expect(over.theme).toEqual({ id: "clean-minimal", overrides: { typography: { font: "bebas", captionPosition: "top" }, motion: { shake: 0.3 } } });
    expect(over.style?.font).toBe("bebas");
    expect(over.style?.captions.position).toBe("top");
    expect(over.segments[0].motion?.shake).toBe(0.3);
    const again = setThemeOverride(over, { typography: { font: "montserrat" } }, ctx);
    expect(again.theme?.overrides).toEqual({ typography: { captionPosition: "top" }, motion: { shake: 0.3 } });
    const reset = resetToTheme(again, ctx);
    expect(reset.theme).toEqual({ id: "clean-minimal" });
    expect(reset.style?.font).toBe("montserrat");
    // The locked cut is unlocked and takes the theme's own motion.
    expect(reset.segments[2].motion?.locked).toBeUndefined();
    expect(reset.segments[2].motion?.shake).toBeUndefined();
    expect(reset.segments[2].motion?.zoom).toMatchObject({ from: 1, to: 1.05 });
  });
  it("a bad override falls back to the theme's value", () => {
    const themed = applyTheme(edl, themeById("clean-minimal")!, ctx);
    const over = setThemeOverride(themed, { typography: { font: "papyrus" } }, ctx);
    expect(over.style?.font).toBe("montserrat");
    expect(over.theme?.overrides).toBeUndefined();
  });
});

describe("helpers", () => {
  it("motionForSegment gives nothing for a still theme", () => {
    expect(motionForSegment(themeById("retro")!, edl.segments[1], 1, null, [])).toEqual({ shake: 0.15 });
    expect(sentencePunches(edl.segments[1], null)).toEqual([]);
  });
});
