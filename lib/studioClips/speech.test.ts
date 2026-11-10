import { describe, expect, it } from "vitest";
import { classifyPauses, editSpeech, findMistakes, sentences, speechCuts, speechJump, speechNote } from "./speech";
import { captionsForEdl, underVoice, voiceTailEnvelope, UNDER_VOICE } from "./timeline";
import type { Edl, TranscriptWord } from "./types";

/** Words from "text@start-end" tokens, seconds. */
const say = (...tokens: string[]): TranscriptWord[] => tokens.map((t) => {
  const [text, span] = t.split("@");
  const [a, b] = span.split("-").map(Number);
  return { text, startMs: Math.round(a * 1000), endMs: Math.round(b * 1000), confidence: 1 };
});
const kinds = (ws: TranscriptWord[]) => classifyPauses(ws).map((p) => p.kind);

describe("what a pause is doing", () => {
  it("keeps a pause before a punchline and after a question, and trims a sentence break", () => {
    const punch = say("We@0-0.2", "make@0.2-0.4", "every@0.4-0.7", "pizza@0.7-1", "by@1-1.1", "hand.@1.1-1.5", "Badly.@2.8-3.3");
    const p = classifyPauses(punch);
    expect(p.map((x) => x.kind)).toEqual(["setup"]);
    // 1.3 s pause, 0.8 s of it kept, half each side.
    expect([p[0].start, p[0].end]).toEqual([1.9, 2.4]);
    expect(kinds(say("Is@0-0.2", "it@0.2-0.3", "worth@0.3-0.6", "it?@0.6-0.9", "Absolutely.@2-2.6", "We@2.7-2.9", "sell@2.9-3.1", "out@3.1-3.3", "daily.@3.3-3.8"))).toEqual(["setup"]);
    expect(kinds(say("The@0-0.2", "dough@0.2-0.5", "rests@0.5-0.8", "two@0.8-1", "days.@1-1.4", "Then@2.9-3.1", "we@3.1-3.2", "stretch@3.2-3.6", "it@3.6-3.7", "by@3.7-3.8", "hand@3.8-4", "and@4-4.1", "bake@4.1-4.4", "it.@4.4-4.6"))).toEqual(["sentence"]);
  });
  it("cuts hesitation and dead air in the middle of a sentence down to a breath, and leaves breaths alone", () => {
    const ws = say("Most@0-0.3", "people@0.3-0.7", "um@1.5-1.7", "forget@2.3-2.7", "the@2.7-2.8", "sauce@2.8-3.2", "is@3.4-3.5", "the@3.5-3.6", "whole@4.9-5.2", "point.@5.2-5.6");
    expect(kinds(ws)).toEqual(["hesitation", "hesitation", "hesitation"]);
    // "the … whole" is a hesitant word before a gap; a 0.2 s breath ("sauce is") is never touched.
    expect(classifyPauses(ws).every((p) => p.end - p.start >= 0.25)).toBe(true);
  });
  it("without punctuation, only cuts long gaps, gently", () => {
    const ws = say("we@0-0.2", "open@0.2-0.5", "at@0.5-0.6", "five@0.6-1", "come@1.6-1.9", "early@3.4-3.9");
    expect(kinds(ws)).toEqual(["dead"]);
    expect(sentences(ws)).toEqual([[0, 4], [5, 5]]);
  });
});

describe("mistakes", () => {
  it("keeps the last take of a line said twice, and not two different lines that start alike", () => {
    const retake = findMistakes(say("Our@0-0.2", "dough@0.2-0.5", "rests@0.5-0.8", "for@0.8-0.9", "two@0.9-1.1", "days.@1.1-1.5", "Our@2.2-2.4", "dough@2.4-2.7", "rests@2.7-3", "for@3-3.1", "three@3.1-3.4", "days.@3.4-3.8"));
    expect(retake).toEqual([{ start: 0, end: 2.2, why: "retake" }]);
    expect(findMistakes(say("We@0-0.2", "make@0.2-0.5", "pizza.@0.5-0.9", "We@1.2-1.4", "make@1.4-1.7", "pasta@1.7-2", "too.@2-2.3"))).toEqual([]);
  });
  it("takes out a restarted phrase, a broken-off word and a lone um, but not 'very very'", () => {
    const ws = say("We@0-0.2", "open@0.2-0.5", "at,@0.5-0.6", "we@0.9-1.1", "open@1.1-1.4", "at@1.4-1.5", "five.@1.5-1.9", "It's@2.5-2.7", "es-@2.7-2.9", "essential.@3-3.6", "Um@4-4.2", "it's@4.4-4.6", "very@4.6-4.8", "very@4.8-5", "good.@5-5.4");
    expect(findMistakes(ws).map((c) => [c.why, c.start, c.end])).toEqual([["restart", 0, 0.9], ["restart", 2.7, 3], ["filler", 4, 4.4]]);
  });
});

describe("tightening a cut", () => {
  const words = say("Our@0-0.2", "dough@0.2-0.5", "rests@0.5-0.8", "for@0.8-0.9", "two@0.9-1.1", "days.@1.1-1.5", "Our@2.2-2.4", "dough@2.4-2.7", "rests@2.7-3", "for@3-3.1", "three@3.1-3.4", "days.@3.4-3.8", "Then@5.6-5.8", "we@5.8-5.9", "bake@5.9-6.2", "it@6.2-6.3", "hot.@6.3-6.7");
  const seg = { id: "s1", clipId: "t", in: 0, out: 7, role: "opener" as const, transition: undefined };
  it("splits a talking shot around what comes out, keeping the first piece's role", () => {
    const r = editSpeech([seg, { id: "s2", clipId: "p", in: 0, out: 3, role: "ending" as const, transition: "fade" as const }], { t: words, p: null });
    // The first take (0 to 2.2) goes; the 1.8 s gap before "Then" is trimmed to 0.45 s.
    expect(r.segments.map((s) => [s.clipId, s.in, s.out, s.role])).toEqual([["t", 2.2, 4.02, "opener"], ["t", 5.38, 7, "body"], ["p", 0, 3, "ending"]]);
    expect(r.segments.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    expect(r.segments[2].transition).toBe("fade");
    expect(speechNote(r.removed)).toBe("SOCIA tightened the speech by 3.6 s: 1 earlier take of a line said again, 1 pause shortened (set-up pauses before a punchline are kept).");
  });
  it("never leaves a sliver, and leaves a shot without words alone", () => {
    const short = editSpeech([{ ...seg, in: 1.2, out: 2.6 }], { t: words });
    expect(short.segments.every((s) => s.out - s.in >= 0.5)).toBe(true);
    const quiet = editSpeech([{ ...seg, clipId: "p" }], { p: null });
    expect(quiet.segments).toEqual([{ ...seg, clipId: "p" }]);
    expect(speechNote(quiet.removed)).toBe("");
  });
  it("is the same the second time", () => {
    const once = editSpeech([seg], { t: words });
    const twice = editSpeech(once.segments, { t: words });
    expect(twice.segments).toEqual(once.segments);
    expect(twice.removed).toEqual([]);
    expect(speechCuts(null)).toEqual([]);
  });
  it("knows a jump inside speech from a stutter", () => {
    expect(speechJump(words, 4.03, 5.38)).toBe(true);
    expect(speechJump(null, 4, 4.5)).toBe(false);
    expect(speechJump(words, 6.9, 7.2)).toBe(false);
  });
});

describe("a voice carried over the next shot (L-cut)", () => {
  const dough = say("Our@2.2-2.4", "dough@2.4-2.7", "rests@2.7-3", "for@3-3.1", "three@3.1-3.4", "days.@3.4-3.8");
  it("keeps the next shot's own sound low under the voice, then brings it back", () => {
    expect(underVoice(0, 30)).toBe(UNDER_VOICE);
    expect(underVoice(29, 30)).toBe(UNDER_VOICE);
    expect(underVoice(33, 30)).toBeCloseTo(0.575, 3);
    expect(underVoice(40, 30)).toBe(1);
    expect(underVoice(5, 0)).toBe(1);
    expect(voiceTailEnvelope(0, 30)).toBe(1);
    expect(voiceTailEnvelope(29, 30)).toBeLessThan(0.3);
  });
  it("keeps captions for the words said over the next shot", () => {
    const edl: Edl = {
      version: 1, fps: 30, width: 1080, height: 1920, targetSec: { min: 5, max: 20 }, text: [], captions: { source: "transcript" }, enhance: [], audio: [], cta: null, music: null, caption: "", notes: [],
      segments: [{ id: "s1", clipId: "t", in: 2.2, out: 3.2, role: "opener", note: "", voiceTail: 0.7 }, { id: "s2", clipId: "p", in: 0, out: 3, role: "body", note: "" }],
    };
    const caps = captionsForEdl(edl, { t: dough });
    expect(caps.map((c) => c.text.trim())).toEqual(["Our", "dough", "rests", "for", "three", "days."]);
    expect(caps[caps.length - 1].startMs).toBe(1200);
  });
});
