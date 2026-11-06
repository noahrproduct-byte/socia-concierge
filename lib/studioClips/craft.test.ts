import { describe, expect, it } from "vitest";
import { cleanCaptionWords, joinStutter, readsAsEnglish } from "./captionClean";
import { clearJumpCuts, isAutoFrame, jumpCutCount, varyJumpCuts, JUMP } from "./jumpCuts";
import { duckLevel, speechShare, speechSpans, DUCK } from "./musicDuck";
import { cutPauses, speechPauses, PAUSE } from "./sound";
import { captionsForEdl } from "./timeline";
import type { Edl, EdlSegment } from "./types";

const w = (text: string, startMs = 0, endMs = startMs + 200) => ({ text, startMs, endMs, confidence: null });
const seg = (id: string, clipId: string, a: number, b: number, over: Partial<EdlSegment> = {}): EdlSegment => ({ id, clipId, in: a, out: b, role: "body", note: "", ...over });
const edlOf = (segments: EdlSegment[], over: Partial<Edl> = {}): Edl => ({ version: 1, fps: 30, width: 1080, height: 1920, segments, text: [], audio: [], captions: true, ...over } as unknown as Edl);

describe("captions show what was meant, from what was said", () => {
  it("joins a stuttered start, leaves real compounds alone", () => {
    expect(joinStutter("Wh-what?")).toBe("what?");
    expect(joinStutter("b-but")).toBe("but");
    expect(joinStutter("I-I")).toBe("I");
    expect(joinStutter("well-known")).toBe("well-known");
    // A real prefix is a real word, not a stutter.
    expect(joinStutter("re-record")).toBe("re-record");
    expect(joinStutter("pro-product")).toBe("pro-product");
    expect(joinStutter("co-cook")).toBe("co-cook");
  });

  it("drops broken-off words and English filler sounds, and passes the capital on", () => {
    const said = ["Um,", "so", "the", "es--", "espresso", "is", "uh", "th-the", "product", "of", "the", "week", "and", "you", "have", "to", "try", "it."].map((t, i) => w(t, i * 300));
    expect(readsAsEnglish(said)).toBe(true);
    expect(cleanCaptionWords(said).map((x) => x.text).join(" ")).toBe("So the espresso is the product of the week and you have to try it.");
    // Timings are untouched: a kept word is the same word at the same time.
    expect(cleanCaptionWords(said)[1]).toBe(said[2]);
  });

  it("keeps 'um' when the transcript isn't English, and still drops a drawn-out sound", () => {
    const pt = ["Eu", "quero", "um", "café", "hmmm", "e", "um", "pão", "de", "queijo"].map((t, i) => w(t, i * 300));
    expect(readsAsEnglish(pt)).toBe(false);
    expect(cleanCaptionWords(pt).map((x) => x.text).join(" ")).toBe("Eu quero um café e um pão de queijo");
  });

  it("is what the video's captions use", () => {
    const words = { c1: ["Um,", "the", "oven", "is", "uh", "ready", "and", "you", "have", "to", "see", "this"].map((t, i) => w(t, i * 300)) };
    const caps = captionsForEdl(edlOf([seg("a", "c1", 0, 4)]), words);
    expect(caps.map((c) => c.text.trim()).join(" ")).toBe("The oven is ready and you have to see this");
  });
});

describe("a pause is a gap in the words, not only a quiet stretch", () => {
  it("shrinks a measured silence until it clears every word, and drops what is no longer a pause", () => {
    // Quiet speech at 2.0 to 2.4 s sits inside a measured silence of 1.0 to 3.5 s.
    const out = speechPauses([{ start: 1, end: 3.5 }], [w("soft", 2000, 2400)]);
    expect(out).toEqual([{ start: 1, end: Number((2 - PAUSE.wordLeadSec).toFixed(2)) }, { start: Number((2.4 + PAUSE.wordTailSec).toFixed(2)), end: 3.5 }]);
    // A word in the middle of a 1.2 s silence leaves no pause at all.
    expect(speechPauses([{ start: 1, end: 2.2 }], [w("yes", 1500, 1700)])).toEqual([]);
    // No transcript: the silences stand as measured.
    expect(speechPauses([{ start: 1, end: 3 }], null)).toEqual([{ start: 1, end: 3 }]);
  });

  it("keeps more air either side when asked", () => {
    const e = edlOf([seg("a", "c1", 0, 10)]);
    const tight = cutPauses(e, { c1: [{ start: 4, end: 6 }] });
    const airy = cutPauses(e, { c1: [{ start: 4, end: 6 }] }, PAUSE.airSec);
    expect(tight.seconds).toBe(Number((2 - 2 * PAUSE.keepSec).toFixed(2)));
    expect(airy.seconds).toBe(Number((2 - 2 * PAUSE.airSec).toFixed(2)));
    expect(airy.edl.segments.map((s) => [s.in, s.out])).toEqual([[0, 4 + PAUSE.airSec], [6 - PAUSE.airSec, 10]]);
  });
});

describe("jump cuts", () => {
  const run = edlOf([seg("a", "c1", 0, 3), seg("b", "c1", 4, 7), seg("c", "c1", 8, 11), seg("d", "c2", 0, 3), seg("e", "c2", 4, 6, { transition: "fade" })]);

  it("counts hard cuts inside one clip, not a new clip or a transition", () => {
    expect(jumpCutCount(run)).toBe(2);
  });

  it("punches in on every other piece of a run, and a new clip opens at its own framing", () => {
    const { edl, changed } = varyJumpCuts(run);
    expect(changed).toBe(1);
    expect(edl.segments.map((s) => isAutoFrame(s.frame))).toEqual([false, true, false, false, false]);
    expect(edl.segments[1].frame).toEqual({ zoom: JUMP.zoom, x: JUMP.x, y: JUMP.y });
    // Idempotent.
    expect(varyJumpCuts(edl).changed).toBe(0);
    expect(clearJumpCuts(edl).edl.segments.every((s) => !s.frame)).toBe(true);
  });

  it("never touches a framing the person chose, and takes its own punch-in off a piece that left the run", () => {
    const mine = { zoom: 1.5, x: 0.3, y: 0.4 };
    const e = edlOf([seg("a", "c1", 0, 3), seg("b", "c1", 4, 7, { frame: mine }), seg("c", "c1", 8, 11)]);
    expect(varyJumpCuts(e).edl.segments[1].frame).toEqual(mine);
    const moved = edlOf([seg("a", "c1", 0, 3), seg("b", "c2", 4, 7, { frame: { zoom: JUMP.zoom, x: JUMP.x, y: JUMP.y } })]);
    expect(varyJumpCuts(moved).edl.segments[1].frame).toBeUndefined();
  });
});

describe("music under speech", () => {
  const e = edlOf([seg("a", "c1", 0, 10)]);
  const words = { c1: [w("one", 1000, 1300), w("two", 1500, 1800), w("three", 2200, 2600), w("later", 7000, 7400)] };

  it("finds where someone speaks on the cut, closing gaps too short to matter", () => {
    expect(speechSpans(e, words)).toEqual([{ start: 1, end: 2.6 }, { start: 7, end: 7.4 }]);
    expect(speechSpans(e, { c1: null })).toEqual([]);
    expect(Math.round(speechShare(speechSpans(e, words), 10) * 100)).toBe(20);
  });

  it("sits low under the words, full away from them, and moves between without a jump", () => {
    const spans = speechSpans(e, words);
    expect(duckLevel(0, spans)).toBe(1);
    expect(duckLevel(1.5, spans)).toBe(DUCK.under);
    // Halfway down, just before the first word.
    expect(duckLevel(1 - DUCK.fallSec / 2, spans)).toBeCloseTo((1 + DUCK.under) / 2, 5);
    // Held for the tail after the last word, then back up.
    expect(duckLevel(2.6 + DUCK.tailSec, spans)).toBe(DUCK.under);
    expect(duckLevel(2.6 + DUCK.tailSec + DUCK.riseSec / 2, spans)).toBeCloseTo((1 + DUCK.under) / 2, 5);
    expect(duckLevel(5, spans)).toBe(1);
    // Never louder than the person's own level, never below the ducked level.
    for (let t = 0; t <= 10; t += 0.05) { const l = duckLevel(t, spans); expect(l).toBeGreaterThanOrEqual(DUCK.under); expect(l).toBeLessThanOrEqual(1); }
    expect(duckLevel(3, [])).toBe(1);
  });
});
