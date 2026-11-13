import { describe, expect, it } from "vitest";
import { asHookPair } from "@/lib/textPresets";
import { EDIT_STYLES, pickStyle, speechShare, styleNote, styleOf, textForStyle, TALKING_SHARE } from "./profiles";
import { PACING, applyPacing, pacingRules } from "./pacing";
import { decideJoins } from "./joins";
import { classifyPauses } from "./speech";
import type { ClipForEdl } from "./edl";
import type { Edl, TranscriptWord } from "./types";

const w = (text: string, a: number, b: number): TranscriptWord => ({ text, startMs: a * 1000, endMs: b * 1000, confidence: 1 });

describe("which style a cut is edited in", () => {
  it("follows the prompt first", () => {
    expect(pickStyle({ brief: "a quick tutorial on booking", niche: "pizza restaurant", speechShare: 0 }).id).toBe("demo");
    expect(pickStyle({ brief: "hype montage of game day", niche: null, speechShare: 0.9 }).id).toBe("energetic");
    expect(pickStyle({ brief: "something calm and luxurious", niche: "gym", speechShare: 0 }).id).toBe("calm");
    expect(pickStyle({ brief: "show the double crust being made", niche: "gym", speechShare: 0.8 })).toEqual({ id: "process", why: "your prompt asked for it" });
  });
  it("then whether the footage is mostly someone talking", () => {
    expect(pickStyle({ brief: "", niche: "pizza restaurant", speechShare: TALKING_SHARE }).id).toBe("talking");
    expect(pickStyle({ brief: null, niche: "social media app", speechShare: 0.7 }).id).toBe("demo");
  });
  it("then the account's niche, then food and process", () => {
    expect(pickStyle({ niche: "CrossFit gym in Austin", speechShare: 0.1 }).id).toBe("energetic");
    expect(pickStyle({ niche: "luxury real estate", speechShare: 0 }).id).toBe("calm");
    expect(pickStyle({ niche: "barbershop", speechShare: 0 }).id).toBe("process");
    expect(pickStyle({ niche: null, speechShare: 0 })).toEqual({ id: "process", why: "it suits footage of something being made or served" });
  });
  it("measures how much of the footage is talk from the word timings", () => {
    expect(speechShare([{ durationSec: 10, words: [w("hi", 0, 2), w("there", 2, 4)] }, { durationSec: 10, words: null }])).toBeCloseTo(0.2);
    expect(speechShare([])).toBe(0);
  });
  it("explains itself in the cut's notes, without em dashes", () => {
    const note = styleNote({ id: "talking", why: "someone is talking in most of the footage" });
    expect(note).toMatch(/^SOCIA edited this as talking to camera because someone is talking in most of the footage: the words carry it/);
    for (const s of Object.values(EDIT_STYLES)) expect(`${s.label} ${s.summary} ${s.prompt}`).not.toMatch(/—/);
  });
});

describe("what a style changes", () => {
  it("sets the pacing numbers, and the food default matches the rules SOCIA had", () => {
    expect(pacingRules({}).averageCutSec).toEqual(PACING.averageCutSec);
    expect(pacingRules({ editStyle: "process" }).silentMaxSec).toBe(PACING.silentMaxSec);
    expect(pacingRules({ editStyle: "talking" }).speechMaxSec).toBe(15);
    expect(pacingRules({ editStyle: "energetic" }).openerMaxSec).toBe(3);
    expect(styleOf("nonsense").id).toBe("process");
  });
  it("lets a calm shot run longer before it is called a drag", () => {
    const clip: ClipForEdl = { id: "c", position: 0, durationSec: 30, words: null, silences: null, medianLuma: null, warmth: null, brightness: null, contrastLevel: null, rmsDb: null, audioLevel: null, hasSpeech: false };
    const edl = (editStyle?: Edl["editStyle"]): Edl => ({ version: 1, fps: 30, width: 1080, height: 1920, targetSec: { min: 5, max: 30 }, text: [], captions: null, enhance: [], audio: [], cta: null, music: null, caption: "", notes: [], editStyle,
      segments: [{ id: "s1", clipId: "c", in: 0, out: 3, role: "opener", note: "" }, { id: "s2", clipId: "c", in: 10, out: 16.5, role: "body", note: "" }, { id: "s3", clipId: "c", in: 20, out: 23, role: "ending", note: "" }] });
    // Straight after the opening, a food cut keeps 3 s of it, its end; a calm cut lets all 6.5 s run.
    expect([applyPacing(edl(), [clip]).edl.segments[1].in, applyPacing(edl(), [clip]).edl.segments[1].out]).toEqual([13.5, 16.5]);
    expect([applyPacing(edl("calm"), [clip]).edl.segments[1].in, applyPacing(edl("calm"), [clip]).edl.segments[1].out]).toEqual([10, 16.5]);
  });
  it("joins with hard cuts where the style does, and still dissolves food", () => {
    const segs = [{ clipId: "a", in: 0, out: 3 }, { clipId: "b", in: 0, out: 3 }];
    expect(decideJoins(segs, [], null, "cut").segments[1]).not.toHaveProperty("transition");
    expect(decideJoins(segs, [], null, "cut").joins[0].why).toBe("style");
    expect(decideJoins(segs, [], null, styleOf("process").joins).segments[1]).toHaveProperty("transition", "fade");
  });
  it("keeps more of each pause in a natural-paced style", () => {
    const words = [w("Then", 0, 0.3), w("press", 0.3, 0.7), w("save.", 0.7, 1.1), w("Now", 3, 3.2), w("it", 3.2, 3.3), w("syncs", 3.3, 3.7), w("to", 3.7, 3.8), w("everything.", 3.8, 4.5)];
    const tight = classifyPauses(words)[0], natural = classifyPauses(words, "natural")[0];
    expect(tight.end - tight.start).toBeGreaterThan(natural.end - natural.start);
  });
});

describe("on-screen words by style (Noah's caption taste, 2026-11-12)", () => {
  const text = [
    { id: "t1", at: 0, end: 2, text: "tossed in\nthe pan", role: "opening" as const, presetId: "hook_pair" as const },
    { id: "t3", at: 9, end: 11, text: "Come before 10", role: "cta" as const, presetId: "callout_box" as const },
  ];
  it("keeps the designed hook on every style, food and calm included", () => {
    for (const id of ["process", "calm", "talking", "demo", "energetic"] as const) expect(textForStyle({ editStyle: id, text }).text).toEqual(text);
  });
  it("sets a one-line opening title as a Hook Pair in the clean look, never in the outline look", () => {
    // Build 9d78cf7f (2026-11-12): "fresh out of the oven" came out as a plain title.
    const plain = [{ id: "t1", at: 0, end: 2.5, text: "fresh out of the oven", role: "opening" as const, presetId: "hook_title" as const }];
    expect(textForStyle({ editStyle: "process", text: plain, style: { textBox: "none" } }).text[0]).toMatchObject({ text: "fresh out of the\noven", presetId: "hook_pair" });
    expect(textForStyle({ editStyle: "process", text: plain, style: { textBox: "outline" } }).text).toEqual(plain);
    expect(asHookPair("the first slice of the day")).toBe("the first slice of the\nday");
    expect(asHookPair("wait for it")).toBe("wait\nfor it");
    expect(asHookPair("hot")).toBeNull();
  });
  it("tells the model at most two text moments on food, never a label on every shot", () => {
    expect(EDIT_STYLES.process.prompt).toMatch(/at most two text moments/);
    expect(EDIT_STYLES.process.prompt).toMatch(/never a label on every shot/);
    expect(EDIT_STYLES.process.prompt).toMatch(/finished thing for 1 to 2 seconds/);
    expect(EDIT_STYLES.process.prompt).not.toMatch(/\u2014/);
  });
});
