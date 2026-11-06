import { describe, it, expect } from "vitest";
import { PICK_SYSTEM, checkPicks, clipWords, formatLines, lengthRange, packWords, pickMessage, transcriptLines, unpackWords, validatePicks } from "./pick";
import { clipResultLines } from "./learn";
import { clipCredits } from "@/lib/credits/config";
import type { TranscriptWord } from "@/lib/transcribe/types";

// 60 words, one every 0.5 s from 10 s, sentences of 10 words.
const words: TranscriptWord[] = Array.from({ length: 60 }, (_, i) => ({
  text: `w${i}${i % 10 === 9 ? "." : ""}`, startMs: 10_000 + i * 500, endMs: 10_000 + i * 500 + 400, confidence: null,
}));

describe("the transcript the picker reads", () => {
  it("breaks into timed lines at sentence ends and pauses", () => {
    const lines = transcriptLines(words);
    expect(lines).toHaveLength(6);
    expect(lines[0]).toMatchObject({ startMs: 10_000, endMs: 14_900 });
    const paused = [...words.slice(0, 3), { text: "later", startMs: 30_000, endMs: 30_400, confidence: null }];
    expect(transcriptLines(paused).map((l) => l.text)).toEqual(["w0 w1 w2", "later"]);
    expect(formatLines(lines.slice(0, 1))).toBe("[10.0-14.9] w0 w1 w2 w3 w4 w5 w6 w7 w8 w9.");
  });

  it("stores words compactly and reads them back", () => {
    expect(unpackWords(packWords(words))).toEqual(words);
    expect(unpackWords([["ok", 1, 2], ["bad"], null, "x"])).toEqual([{ text: "ok", startMs: 1, endMs: 2, confidence: null }]);
    expect(unpackWords(null)).toEqual([]);
  });

  it("gives the brief Noah's examples, the brand's results and the niche, when there are any", () => {
    const base = { brand: "Salvo's Pizza", lines: transcriptLines(words), durationMs: 40_000, options: { maxClips: 3, lengths: ["under30" as const] }, examples: [], results: [], niche: null };
    const plain = pickMessage(base);
    expect(plain).toContain("Pick up to 3 clips, each 8 to 30 seconds long.");
    expect(plain).not.toContain("Noah's examples");
    const full = pickMessage({ ...base, examples: [{ verdict: "good", transcript: "The dough is the whole business.", seconds: 12, why: "Opens on the claim." }], results: ['"Dough" (12 s): 2.1x your usual'], niche: "Question hooks lead" });
    expect(full).toContain("GOOD (12 s)");
    expect(full).toContain("This brand's posted clips");
    expect(full).toContain("Question hooks lead");
  });
});

describe("checking the picker's answer", () => {
  const opts = { maxClips: 2, lengths: ["under30" as const] };

  it("snaps each clip to whole words and keeps its words for captions", () => {
    const [p] = validatePicks({ clips: [{ start: 10.3, end: 19.7, title: "A", hook: "w0", score: 8, reason: "r" }] }, words, opts);
    expect(p).toMatchObject({ startMs: 10_000, endMs: 19_900, score: 8 });
    expect(p.text.startsWith("w0 ")).toBe(true);
    expect(clipWords(words, p.startMs, p.endMs)).toHaveLength(20);
  });

  it("lands on a sentence's edge when one is close, never on the next sentence's first word", () => {
    // The answer overshoots w19. by half a second, into w20 of the next sentence.
    const [p] = validatePicks({ clips: [{ start: 10.6, end: 20.3, title: "A", hook: "", score: 8, reason: "" }] }, words, opts);
    expect(p.text.startsWith("w0 ")).toBe(true);
    expect(p.text.endsWith("w19.")).toBe(true);
    // No sentence edge within reach: it stays on the words asked for.
    const plain = Array.from({ length: 80 }, (_, i) => ({ text: `w${i}`, startMs: i * 500, endMs: i * 500 + 400, confidence: null }));
    const [q] = validatePicks({ clips: [{ start: 5, end: 20, title: "B", hook: "", score: 8, reason: "" }] }, plain, opts);
    expect(q.text.startsWith("w10 ")).toBe(true);
    expect(q.text.endsWith(" w39")).toBe(true);
  });

  it("drops clips that are too short or long, outside the video, or reversed", () => {
    const bad = [
      { start: 10, end: 13, title: "short", hook: "", score: 9, reason: "" },
      { start: 90, end: 100, title: "outside", hook: "", score: 9, reason: "" },
      { start: 20, end: 15, title: "reversed", hook: "", score: 9, reason: "" },
    ];
    expect(validatePicks({ clips: bad }, words, opts)).toEqual([]);
    const longer = Array.from({ length: 120 }, (_, i) => ({ text: `w${i}`, startMs: i * 500, endMs: i * 500 + 400, confidence: null }));
    expect(validatePicks({ clips: [{ start: 0, end: 40, title: "long", hook: "", score: 9, reason: "" }] }, longer, opts)).toEqual([]);
    expect(validatePicks(null, words, opts)).toEqual([]);
  });

  it("keeps the better of two overlapping clips, best first, up to the number asked for", () => {
    const picks = validatePicks({ clips: [
      { start: 10, end: 20, title: "low", hook: "", score: 5, reason: "" },
      { start: 11, end: 21, title: "overlaps the best", hook: "", score: 7, reason: "" },
      { start: 22, end: 32, title: "best", hook: "", score: 9, reason: "" },
      { start: 33, end: 39.9, title: "third", hook: "", score: 6, reason: "" },
    ] }, words, opts);
    expect(picks.map((p) => p.title)).toEqual(["best", "overlaps the best"]);
    expect(validatePicks({ clips: [{ start: 10, end: 20, title: "x", hook: "", score: 99, reason: "" }] }, words, opts)[0].score).toBe(10);
  });

  it("counts what it drops, so a job with no clips can say why", () => {
    const c = checkPicks({ clips: [
      { start: 10, end: 20, title: "kept", hook: "", score: 9, reason: "" },
      { start: 11, end: 21, title: "overlap", hook: "", score: 8, reason: "" },
      { start: 22, end: 24, title: "too short", hook: "", score: 7, reason: "" },
      { start: 90, end: 100, title: "past the end", hook: "", score: 7, reason: "" },
      { start: 30, end: 29, title: "reversed", hook: "", score: 7, reason: "" },
    ] }, words, { maxClips: 5, lengths: ["under30"] });
    expect(c).toMatchObject({ returned: 5, badTimes: 1, tooFewWords: 1, wrongLength: 1, overlaps: 1 });
    expect(c.picks.map((p) => p.title)).toEqual(["kept"]);
  });

  it("shows the model plain seconds, so a time can't be read as minutes and seconds", () => {
    const m = pickMessage({ brand: "b", lines: [{ startMs: 230_500, endMs: 236_800, text: "People say." }], durationMs: 256_700, options: { maxClips: 5, lengths: ["under30"] }, examples: [], results: [], niche: null });
    expect(m).toContain("[230.5-236.8] People say.");
    expect(m).toContain("Video length: 256.7 seconds.");
    expect(m).not.toMatch(/\d:\d\d/);
    expect(PICK_SYSTEM).toContain("plain seconds");
    expect(PICK_SYSTEM).not.toContain("an empty list is better");
  });

  it("allows the lengths asked for", () => {
    expect(lengthRange(["under30", "30to60"])).toEqual({ min: 8, max: 60 });
    expect(lengthRange([])).toEqual({ min: 15, max: 90 });
  });
});

describe("what the picker learns and what it costs", () => {
  it("lists the brand's posted clips best first", () => {
    const lines = clipResultLines([
      { title: "Weak", hook: null, seconds: 40, multiplier: 0.6, text: "0.6x your usual interactions" },
      { title: "Strong", hook: "Why does nobody tell you", seconds: 22, multiplier: 2.4, text: "2.4x your usual interactions" },
    ]);
    expect(lines[0]).toBe('"Strong" (22 s), opens "Why does nobody tell you": 2.4x your usual interactions');
  });

  it("prices SOCIA's own clipping per job plus per minute, well under the provider's", () => {
    expect(clipCredits(10, "clip_v1", "socia")).toBeLessThan(clipCredits(10, "clip_v1", "vizard"));
    expect(clipCredits(60, "clip_v1", "socia")).toBeGreaterThan(clipCredits(10, "clip_v1", "socia"));
    expect(clipCredits(10, "clip_v2", "socia")).toBe(clipCredits(10, "clip_v1", "socia"));
  });
});
