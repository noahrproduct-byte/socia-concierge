import { describe, it, expect } from "vitest";
import { sanitizeReference, cleanPrompt, shotStats, timedSpeech, cleanBreakdown, referenceBrief, referenceStyle, titleFor, nextBriefIdx, isBriefIdx, opportunityFromBrief, briefText, withBrief } from "./reference";
import { DEFAULT_STYLE } from "./style";
import type { ClipCard, Edl } from "./types";

const jpeg = "QUJD"; // base64 placeholder
const ref = (over: Record<string, unknown> = {}) => ({ name: "ref.mp4", durationSec: 12, width: 1080, height: 1920, cuts: [1.5, 3, 4.5, 9], frames: [{ t: 0.2, jpeg }, { t: 5, jpeg }], words: [{ text: "Watch", startMs: 100, endMs: 400 }, { text: "this", startMs: 400, endMs: 700 }], audio: { hasAudio: true, level: "ok", audibleRatio: 0.9 }, ...over });

describe("reference input", () => {
  it("keeps a well-formed reference and bounds it", () => {
    const r = sanitizeReference(ref({ name: "my <ref>.mp4", cuts: [9, 1.5, 1.5, 99] }))!;
    expect(r.name).toBe("my ref.mp4");
    expect(r.cuts).toEqual([1.5, 9]);
    expect(r.frames).toHaveLength(2);
    expect(r.words).toHaveLength(2);
  });
  it("refuses one that is too long, has no frames, or carries something that isn't base64", () => {
    expect(sanitizeReference(ref({ durationSec: 400 }))).toBeNull();
    expect(sanitizeReference(ref({ frames: [] }))).toBeNull();
    expect(sanitizeReference(ref({ frames: [{ t: 1, jpeg: "<script>" }] }))).toBeNull();
    expect(sanitizeReference(null)).toBeNull();
  });
  it("needs at least a few characters of prompt", () => {
    expect(cleanPrompt("  hi ")).toBeNull();
    expect(cleanPrompt(" Fast cuts, punchy opener ")).toBe("Fast cuts, punchy opener");
  });
});

describe("what the browser measured", () => {
  it("counts shots and their median length from the cut times", () => {
    expect(shotStats({ durationSec: 12, cuts: [1.5, 3, 4.5, 9] })).toEqual({ shots: 5, medianShotSec: 1.5, firstCutSec: 1.5 });
    expect(shotStats({ durationSec: 12, cuts: null })).toEqual({ shots: null, medianShotSec: null, firstCutSec: null });
  });
  it("groups speech into timed lines at pauses", () => {
    const t = timedSpeech([{ text: "Watch", startMs: 0, endMs: 300 }, { text: "this", startMs: 300, endMs: 600 }, { text: "Now", startMs: 2000, endMs: 2300 }]);
    expect(t).toBe("0.0–0.6s: Watch this\n2.0–2.3s: Now");
  });
});

describe("the breakdown", () => {
  const raw = {
    summary: "A before and after reveal.", hook: "Close-up of raw dough with a question on screen.", pace: "Cuts every 1.5s, slower at the reveal.", ending: "The finished pizza with a follow ask.",
    beats: [{ start: 3, end: 12, shows: "Reveal", onscreen: "", spoken: "" }, { start: 0, end: 3, shows: "Dough close-up", onscreen: "Guess what this becomes \u2014 ", spoken: "Watch this" }, { start: 5, end: 4, shows: "bad", onscreen: "", spoken: "" }],
    text: { position: "top", box: "accent", uppercase: true, size: "l", font: "bebas", accent: "#FF3300" }, captions: true,
  };
  it("is bounded, ordered and drops impossible beats", () => {
    const b = cleanBreakdown(raw, 12)!;
    expect(b.beats.map((x) => x.start)).toEqual([0, 3]);
    expect(b.beats[0].onscreen).toBe("Guess what this becomes,");
    expect(b.text).toEqual({ position: "top", box: "accent", uppercase: true, size: "l", font: "bebas", accent: "#ff3300" });
    expect(cleanBreakdown({ ...raw, beats: [] }, 12)).toBeNull();
    expect(cleanBreakdown({ ...raw, text: { position: "sideways", font: "comic" } }, 12)!.text).toMatchObject({ position: "middle", font: "inter", accent: "" });
  });
  it("becomes the brief the cut follows, with its beats and measured pace", () => {
    const b = cleanBreakdown(raw, 12)!;
    const text = referenceBrief(b, 12, shotStats({ durationSec: 12, cuts: [1.5, 3, 4.5, 9] }));
    expect(text).toMatch(/12s, 5 shots, a cut about every 1.5s, first cut at 1.5s/);
    expect(text).toMatch(/- 0–3s: Dough close-up\. On screen: "Guess what this becomes,"\. Said: "Watch this"/);
    expect(text).toMatch(/never its footage/);
  });
  it("sets the cut's text style from the reference, keeping the brand colour when none is visible", () => {
    const b = cleanBreakdown(raw, 12)!;
    expect(referenceStyle(b, undefined)).toEqual({ font: "bebas", accent: "#ff3300", textBox: "accent", captions: { position: "top", size: "l", box: true, uppercase: true } });
    const plain = cleanBreakdown({ ...raw, text: { ...raw.text, accent: "", box: "none", position: "none" } }, 12)!;
    expect(referenceStyle(plain, { ...DEFAULT_STYLE, accent: "#00c853" })).toMatchObject({ accent: "#00c853", textBox: "none", captions: { position: "bottom", box: false } });
  });
});

describe("cuts made from a brief", () => {
  it("take -2, -3 … and never the own edit (-1) or single clips (-1000 and below)", () => {
    expect(nextBriefIdx([])).toBe(-2);
    expect(nextBriefIdx([-1, 0, 3, -2, -1001])).toBe(-3);
    expect(isBriefIdx(-1)).toBe(false);
    expect(isBriefIdx(-2)).toBe(true);
    expect(isBriefIdx(-1000)).toBe(false);
    expect(() => nextBriefIdx([-999])).toThrow(/limit/);
  });
  it("offers every usable moment and names a title", () => {
    const card = (strength: "strong" | "weak", opener = false): ClipCard => ({ subject: "", setting: "", action: "", people: "none", moments: [{ start: 0, end: 4, label: "", strength, why: "" }], speech: { present: false, summary: "", hookLine: null }, quality: { visual: "ok", audio: "ok", notes: [] }, tags: [], openerCandidate: opener, createdAt: "2026-01-01T00:00:00Z" } as unknown as ClipCard);
    const o = opportunityFromBrief("T", "A", [{ id: "a", position: 0, durationSec: 4, card: card("strong", true) }, { id: "b", position: 1, durationSec: 4, card: card("weak") }, { id: "c", position: 2, durationSec: 4, card: null }], -2);
    expect(o.clipIds).toEqual(["a"]);
    expect(o.opener?.clipId).toBe("a");
    expect(titleFor("Fast cuts. Then a slow reveal.", null)).toBe("Fast cuts");
    expect(titleFor(null, null)).toBe("Your video");
  });
  it("keeps the brief on the cut and writes it for the model", () => {
    const brief = { prompt: "Make it punchy", reference: "Recreate the structure…", referenceName: "ref.mp4" };
    expect(briefText(brief)).toBe('The person\'s own words:\n"""\nMake it punchy\n"""\n\nRecreate the structure…');
    expect(withBrief({ segments: [] } as unknown as Edl, brief).brief).toEqual(brief);
    expect(withBrief({ segments: [] } as unknown as Edl, undefined).brief).toBeUndefined();
  });
});
