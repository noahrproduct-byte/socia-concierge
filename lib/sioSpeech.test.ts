import { describe, expect, it } from "vitest";
import { COMMA_MS, GLANCE_MS, LINE_MS, SENTENCE_MS, WORD_MS, mouthShapes, speechAt, speechPlan } from "./sioSpeech";

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
    expect(speechAt(p, -1)).toEqual({ shown: [0, 0], mouth: null, speaking: true, nods: 0, mood: "plain", glance: false });
    const start = speechAt(p, 1);
    expect(start.shown).toEqual([1, 0]);
    expect(start.mouth).toBe("e");
    // In the pause after the sentence the mouth rests and the next line hasn't begun.
    const pause = speechAt(p, p.words[2].at - 10);
    expect(pause.shown).toEqual([2, 0]);
    expect(pause.mouth).toBeNull();
    expect(pause.speaking).toBe(true);
    const end = speechAt(p, p.total + 1);
    expect(end).toEqual({ shown: [2, 1], mouth: null, speaking: false, nods: 2, mood: "plain", glance: false });
  });
  it("gives the mouth a shape for each syllable, from its vowel", () => {
    expect(mouthShapes("Hey,")).toEqual(["e"]);
    expect(mouthShapes("routine")).toEqual(["o", "e"]);
    expect(mouthShapes("personalization")).toEqual(["e", "o", "a"]);
    expect(mouthShapes("5")).toEqual(["e"]);
    const [word] = speechPlan(["today"]).words;
    expect(word.beats.map((b) => b.shape)).toEqual(["o", "a"]);
    // Syllables follow each other inside the word, with a rest between them.
    expect(word.beats[0].until).toBeLessThan(word.beats[1].at);
    expect(word.beats[1].until).toBeLessThanOrEqual(speechPlan(["today"]).total);
    const p = speechPlan(["today"]);
    expect(speechAt(p, word.beats[0].until + 1).mouth).toBeNull();
    expect(speechAt(p, word.beats[1].at + 1).mouth).toBe("a");
  });
  it("reads each sentence's mood from how it ends", () => {
    const p = speechPlan(["Done! That works.", "Which days suit you?"]);
    expect(p.moods).toEqual(["bright", "plain", "ask"]);
    expect(speechAt(p, 1).mood).toBe("bright");
    expect(speechAt(p, p.words[1].at + 1).mood).toBe("plain");
    expect(speechAt(p, p.words[3].at + 1).mood).toBe("ask");
    // A line with no closing mark is a plain sentence.
    expect(speechPlan(["Reading your accounts"]).moods).toEqual(["plain"]);
  });
  it("looks at the words as a sentence starts, then back", () => {
    const p = speechPlan(["Here is a longer sentence about your week and your plan."]);
    expect(speechAt(p, 10).glance).toBe(true);
    expect(speechAt(p, GLANCE_MS + 10).glance).toBe(false);
    expect(speechAt(p, p.total + 1).glance).toBe(false);
  });
});
