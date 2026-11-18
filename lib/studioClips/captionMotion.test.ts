import { describe, expect, it } from "vitest";
import { CAPTION_MOTIONS, DEMO_FRAMES, DEMO_PHRASE, beatBefore, captionKey, emphasisFrame, emphasisWord, fitPhases, hash01, isPhraseLevel, sanitizeCaptionOverrides } from "./captionMotion";
import { CAPTION_STYLES, CAPTION_STYLE_DEFAULTS, captionStyle, isCaptionStyleId, sanitizeStyle, withCaptionStyle, CLEAN_STYLE } from "./style";
import { TRANSITIONS } from "./types";
import { overlapFrames } from "./timeline";
import { transitionLook } from "./transitions";

describe("the ten caption motion presets", () => {
  it("are caption styles with defaults, a reference and a matching join that exists", () => {
    expect(CAPTION_MOTIONS).toHaveLength(10);
    for (const m of CAPTION_MOTIONS) {
      expect(captionStyle(m.id).mark).toBe("motion");
      expect(CAPTION_STYLE_DEFAULTS[m.id]).toBeDefined();
      expect(m.reference.length).toBeGreaterThan(2);
      expect(m.observed).toMatch(/;.*;/);
      if (m.transition) expect(TRANSITIONS.some((t) => t.id === m.transition)).toBe(true);
    }
    expect(CAPTION_STYLES.filter((s) => s.mark === "motion")).toHaveLength(10);
  });

  it("set their own face and colour when picked, and survive a round trip through sanitizeStyle", () => {
    const s = withCaptionStyle(CLEAN_STYLE, "tape");
    expect(s.font).toBe("kaushan");
    expect(s.captions.preset).toBe("tape");
    expect(s.captions.highlight).toBe("#d2322d");
    expect(sanitizeStyle(s)).toEqual(s);
    expect(isCaptionStyleId("punch")).toBe(true);
    expect(isCaptionStyleId("nope")).toBe(false);
  });
});

describe("fitting the phases to a page", () => {
  const t = { in: 8, emphasis: 8, out: 8, hold: 10 };
  it("keeps the full entrance and exit on a long page", () => {
    expect(fitPhases(60, t)).toEqual({ in: 8, out: 8, emphasis: 8 });
  });
  it("shortens the entrance and exit together on a short page so a hold remains, never under two frames", () => {
    const f = fitPhases(18, t);
    expect(f.in + f.out).toBeLessThanOrEqual(8);
    expect(f.in).toBeGreaterThanOrEqual(2);
    expect(f.out).toBeGreaterThanOrEqual(2);
    expect(18 - f.in - f.out).toBeGreaterThanOrEqual(10);
    const tiny = fitPhases(6, t);
    expect(tiny.in).toBe(2);
    expect(tiny.out).toBe(2);
  });
  it("keeps a hard exit at zero", () => {
    expect(fitPhases(12, { in: 5, emphasis: 6, out: 0, hold: 6 }).out).toBe(0);
  });
});

describe("the emphasised word and when it lands", () => {
  const words = ["Find", "your", "focus"];
  it("is the last carrying word by default, the cut's highlighted word when there is one, the person's pick first, or none", () => {
    expect(emphasisWord(words, undefined, undefined)).toBe(2);
    expect(emphasisWord(words, undefined, ["find"])).toBe(0);
    expect(emphasisWord(words, "your", ["find"])).toBe(1);
    expect(emphasisWord(words, "Your!", undefined)).toBe(1);
    expect(emphasisWord(words, null, ["find"])).toBe(-1);
    expect(emphasisWord(["the", "a"], undefined, undefined)).toBe(1);
  });
  it("lands on the word's own time with word timing, on the beat the person set, or part way into a phrase", () => {
    const tokens = DEMO_PHRASE.tokens;
    const phases = { in: 8, out: 8, emphasis: 8 };
    expect(isPhraseLevel(tokens)).toBe(false);
    expect(emphasisFrame({ tokens, startMs: 0, keyWord: 2, durationInFrames: DEMO_FRAMES, fps: 30, phases })).toBe(17);
    expect(emphasisFrame({ tokens, startMs: 0, keyWord: 2, beatMs: 300, durationInFrames: DEMO_FRAMES, fps: 30, phases })).toBe(9);
    const phrase = [{ text: " Find your focus", fromMs: 0, toMs: 1100 }];
    expect(isPhraseLevel(phrase)).toBe(true);
    expect(emphasisFrame({ tokens: phrase, startMs: 0, keyWord: 0, durationInFrames: 50, fps: 30, phases })).toBe(20);
    // Never before the entrance has landed, never into the exit.
    expect(emphasisFrame({ tokens, startMs: 0, keyWord: 0, durationInFrames: 30, fps: 30, phases })).toBe(8);
    expect(emphasisFrame({ tokens, startMs: 0, keyWord: 2, beatMs: 5000, durationInFrames: 30, fps: 30, phases })).toBe(14);
  });
  it("lands letters on the beat at or before a word, and on the word without a track", () => {
    expect(beatBefore(1000, null)).toBe(1000);
    expect(beatBefore(1000, { bpm: 120, offsetSec: 0.1 })).toBe(600);
    expect(beatBefore(50, { bpm: 120, offsetSec: 0.1 })).toBe(50);
  });
  it("scatters the same way every time", () => {
    expect(hash01(7)).toBe(hash01(7));
    expect(hash01(7)).not.toBe(hash01(8));
    expect(hash01(123)).toBeGreaterThanOrEqual(0);
    expect(hash01(123)).toBeLessThan(1);
  });
});

describe("a caption's own changes", () => {
  it("are keyed by the clip and the word's time in it", () => {
    expect(captionKey("c1", 1234.6)).toBe("c1@1235");
  });
  it("are bounded, and dropped when empty or unknown", () => {
    const out = sanitizeCaptionOverrides({
      "c1@1200": { preset: "punch", emphasis: " Focus ", beatMs: 123456, anchor: { x: 1.4, y: -1 } },
      "c1@3000": { emphasis: null },
      "c1@4000": { preset: "nope", beatMs: "x" },
      "bad key": { preset: "punch" },
    }, isCaptionStyleId);
    expect(out).toEqual({ "c1@1200": { preset: "punch", emphasis: "Focus", beatMs: 60000, anchor: { x: 1, y: 0 } }, "c1@3000": { emphasis: null } });
    expect(sanitizeCaptionOverrides({}, isCaptionStyleId)).toBeUndefined();
    expect(sanitizeCaptionOverrides("no", isCaptionStyleId)).toBeUndefined();
  });
});

describe("the matching joins", () => {
  it("a tear and a push-in overlap two cuts a little longer than a blend; a motion blur overlaps like a whip", () => {
    expect(overlapFrames("tear", 60, 60)).toBe(12);
    expect(overlapFrames("pushin", 60, 60)).toBe(12);
    expect(overlapFrames("tear", 60, 10)).toBe(5);
    expect(overlapFrames("motionblur", 60, 60)).toBe(9);
  });
  it("a tear reveals the incoming cut behind an edge that crosses the frame, opaque the whole way", () => {
    const start = transitionLook({ frame: 0, frames: 60, into: "tear", overlapIn: 12, overlapOut: 0 });
    expect(start.wipe).toBe(0);
    expect(start.tearing).toBe(true);
    expect(start.opacity).toBe(1);
    const mid = transitionLook({ frame: 6, frames: 60, into: "tear", overlapIn: 12, overlapOut: 0 });
    expect(mid.wipe).toBeGreaterThan(0.3);
    expect(mid.wipe).toBeLessThan(0.7);
    const done = transitionLook({ frame: 12, frames: 60, into: "tear", overlapIn: 12, overlapOut: 0 });
    expect(done.tearing).toBe(false);
    expect(transitionLook({ frame: 11, frames: 60, into: "tear", overlapIn: 12, overlapOut: 0 }).wipe).toBeGreaterThan(0.95);
  });
  it("a push-in starts the incoming cut close and soft and settles it sharp; the outgoing one pushes in", () => {
    const start = transitionLook({ frame: 0, frames: 60, into: "pushin", overlapIn: 12, overlapOut: 0 });
    expect(start.scale).toBeCloseTo(1.4, 2);
    expect(start.zoomBlur).toBeGreaterThan(20);
    expect(transitionLook({ frame: 12, frames: 60, into: "pushin", overlapIn: 12, overlapOut: 0 }).scale).toBe(1);
    const out = transitionLook({ frame: 59, frames: 60, out: "pushin", overlapIn: 0, overlapOut: 12 });
    expect(out.scale).toBeGreaterThan(1.4);
  });
  it("a motion blur blurs along y only; a whip along x only", () => {
    expect(transitionLook({ frame: 2, frames: 60, into: "motionblur", overlapIn: 9, overlapOut: 0 }).blurAxis).toBe("y");
    expect(transitionLook({ frame: 2, frames: 60, into: "whip", overlapIn: 9, overlapOut: 0 }).blurAxis).toBe("x");
    expect(transitionLook({ frame: 2, frames: 60, into: "zoom", overlapIn: 9, overlapOut: 0 }).blurAxis).toBeNull();
  });
});

describe("saving a cut", () => {
  it("keeps the captions' own changes through revalidation, bounded, and drops what no caption needs", async () => {
    const { revalidateEdl } = await import("./edl");
    const clip = { id: "c1", position: 0, durationSec: 20, words: [{ text: "Find", startMs: 1000, endMs: 1300, confidence: 1 }, { text: "your", startMs: 1300, endMs: 1600, confidence: 1 }, { text: "focus", startMs: 1600, endMs: 2200, confidence: 1 }], silences: null, medianLuma: 0.5, warmth: 0, brightness: "ok" as const, contrastLevel: "ok" as const, rmsDb: -20, audioLevel: "ok" as const, hasSpeech: true };
    const edl = {
      version: 1 as const, fps: 30 as const, width: 1080, height: 1920, targetSec: { min: 1, max: 10 },
      segments: [{ id: "s1", clipId: "c1", in: 0.5, out: 4, role: "opener" as const, note: "", }, { id: "s2", clipId: "c1", in: 5, out: 8, role: "body" as const, note: "", transition: "tear" as const }],
      text: [], captions: { source: "transcript" as const }, enhance: [], audio: [], cta: null, music: null, caption: "", notes: [],
      style: withCaptionStyle(CLEAN_STYLE, "editorial"),
      captionOverrides: { "c1@1000": { preset: "punch" as const, emphasis: "focus", beatMs: 400 }, "c1@99999999": { preset: "punch" as const }, nope: {} },
    };
    const r = revalidateEdl(edl, [clip]);
    expect(r.edl.style?.captions.preset).toBe("editorial");
    expect(r.edl.captionOverrides).toEqual({ "c1@1000": { preset: "punch", emphasis: "focus", beatMs: 400 }, "c1@99999999": { preset: "punch" } });
    expect(r.edl.segments[1].transition).toBe("tear");
  });
});

describe("the torn edges", () => {
  it("run round the box in one direction, so no polygon crosses itself", async () => {
    const { tornEdge, tornStrip, tearClip } = await import("./captionMotion");
    const pts = (poly: string) => poly.replace(/^polygon\(|\)$/g, "").split(",").map((p) => p.trim().split(/\s+/).map(parseFloat));
    // A right edge runs bottom to top; closing with the top-left then the bottom-left corner keeps it a loop.
    const right = pts(`polygon(${tornEdge(5, "right", 10, 4)}, 0 0, 0 100%)`);
    const ys = right.slice(0, 11).map((p) => p[1]);
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeLessThan(ys[i - 1]);
    expect(right[right.length - 2]).toEqual([0, 0]);
    expect(right[right.length - 1]).toEqual([0, 100]);
    // A strip: down the left side, up the right.
    const strip = pts(tornStrip(4, 3));
    expect(strip).toHaveLength(16);
    for (let i = 1; i < 8; i++) expect(strip[i][1]).toBeGreaterThan(strip[i - 1][1]);
    for (let i = 9; i < 16; i++) expect(strip[i][1]).toBeLessThan(strip[i - 1][1]);
    // A tear across the frame: down the jagged edge, then back along the bottom and up the left.
    expect(tearClip(0)).toBe("polygon(0 0, 0 0, 0 0)");
    expect(tearClip(1)).toBe("none");
    const half = pts(tearClip(0.5));
    for (let i = 3; i < half.length - 1; i++) expect(half[i][1]).toBeGreaterThan(half[i - 1][1]);
    expect(half[half.length - 1]).toEqual([0, 100]);
  });
});
