import { describe, expect, it } from "vitest";
import { COMMA_MS, LINE_MS, SENTENCE_MS, WORD_MS, speechAt, speechPlan } from "./sioSpeech";

describe("the rhythm of SIO's words", () => {
  it("gives every word a moment, in order, longer for longer words", () => {
    const p = speechPlan(["Hey, I'm SIO."]);
    expect(p.words.map((w) => w.text)).toEqual(["Hey,", "I'm", "SIO."]);
    expect(p.words[0].at).toBe(0);
    // "Hey," is followed by a comma pause.
    expect(p.words[1].at).toBe(WORD_MS + COMMA_MS);
    expect(p.counts).toEqual([3]);
    const long = speechPlan(["a personalization"]);
    expect(long.words[1].open).toBeGreaterThan(long.words[0].open);
    for (let i = 1; i < p.words.length; i++) expect(p.words[i].at).toBeGreaterThan(p.words[i - 1].at);
  });
  it("pauses after a sentence and between lines, and marks where a sentence starts", () => {
    const p = speechPlan(["Got it.", "Which days work best?"]);
    expect(p.counts).toEqual([2, 4]);
    const [, it2, which] = p.words;
    expect(which.at - it2.at).toBeGreaterThanOrEqual(SENTENCE_MS + LINE_MS);
    expect(p.words.filter((w) => w.starts).map((w) => w.text)).toEqual(["Got", "Which"]);
  });
  it("keeps a skipped line's place", () => {
    const p = speechPlan([null, "Hello there", ""]);
    expect(p.counts).toEqual([0, 2, 0]);
    expect(p.words.every((w) => w.line === 1)).toBe(true);
    expect(speechPlan([]).total).toBe(0);
  });
  it("shows the words and moves the mouth from the same plan", () => {
    const p = speechPlan(["Hey there.", "Ready?"]);
    expect(speechAt(p, -1)).toEqual({ shown: [0, 0], mouthOpen: false, speaking: true, nods: 0 });
    const start = speechAt(p, 1);
    expect(start.shown).toEqual([1, 0]);
    expect(start.mouthOpen).toBe(true);
    // In the pause after the sentence the mouth is closed and the next line hasn't begun.
    const pause = speechAt(p, p.words[2].at - 10);
    expect(pause.shown).toEqual([2, 0]);
    expect(pause.mouthOpen).toBe(false);
    expect(pause.speaking).toBe(true);
    const end = speechAt(p, p.total + 1);
    expect(end).toEqual({ shown: [2, 1], mouthOpen: false, speaking: false, nods: 2 });
  });
});
