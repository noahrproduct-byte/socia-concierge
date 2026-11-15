import { describe, expect, it } from "vitest";
import { boardTimeline, cleanBoard } from "./board";
import { EXAMPLE_BOARD } from "./board.example";
import { specTimeline, type AnimatedSpec } from "./spec";
import { voiceFits, voiceScript, wordStarts, type BoardVoice } from "./voice";

const board = cleanBoard(EXAMPLE_BOARD, "190 cm 175 cm")!;

/** ElevenLabs-style timings: every character of `text` takes `per` seconds. */
const timings = (text: string, per = 0.05) => {
  const characters = Array.from(text);
  return { characters, character_start_times_seconds: characters.map((_, i) => +(i * per).toFixed(3)), character_end_times_seconds: characters.map((_, i) => +((i + 1) * per).toFixed(3)) };
};

describe("a storyboard's voiceover", () => {
  const script = voiceScript(board);
  it("says every caption in order, then the ending card", () => {
    expect(script.captions).toBe(board.phrases.map((p) => p.text).join(" "));
    expect(script.text.startsWith(script.captions)).toBe(true);
    expect(script.closing).toContain(board.end.title.join(" "));
    expect(script.closing).toContain(board.end.rows[0].a);
    expect(script.text.length).toBeLessThanOrEqual(1500);
  });
  it("times each caption word from the character timings", () => {
    const t = wordStarts(script.text, script.captions, timings(script.text))!;
    const words = script.captions.split(" ");
    expect(t.words).toHaveLength(words.length);
    expect(t.words[0]).toBe(0);
    // The second word starts one space after the first ends.
    expect(t.words[1]).toBeCloseTo((words[0].length + 1) * 0.05, 2);
    expect(t.end).toBeCloseTo(script.text.length * 0.05, 1);
    expect([...t.words].sort((a, b) => a - b)).toEqual(t.words);
  });
  it("matches words by order when the service changed the text", () => {
    const spoken = script.text.replace("190", "one hundred ninety");
    const t = wordStarts(script.text, script.captions, timings(spoken));
    // More spoken words than caption words is fine; fewer is not.
    expect(t?.words).toHaveLength(script.captions.split(" ").length);
    expect(wordStarts(script.text, script.captions, timings("Too short."))).toBeNull();
    expect(wordStarts(script.text, script.captions, null)).toBeNull();
  });
  it("is used only while the captions still read what it was made from", () => {
    const t = wordStarts(script.text, script.captions, timings(script.text))!;
    const voice: BoardVoice = { url: "blob:x", words: t.words, end: t.end, text: script.captions, voiceId: "v", voiceName: "Voice" };
    expect(voiceFits(board, voice)).toBe(true);
    const edited = { ...board, phrases: board.phrases.map((p, i) => (i === 0 ? { ...p, text: "Something new entirely." } : p)) };
    expect(voiceFits(edited, voice)).toBe(false);
    expect(voiceFits(board, null)).toBe(false);
    expect(voiceFits(board, { ...voice, words: voice.words.slice(1) })).toBe(false);
  });
  it("sets the captions and the video's length from the voice", () => {
    const t = wordStarts(script.text, script.captions, timings(script.text, 0.09))!;
    const tl = boardTimeline(board, t.words, t.end);
    expect(tl.phrases[0].start).toBe(0);
    expect(tl.phrases[1].start).toBe(t.words[board.phrases[0].text.split(" ").length]);
    expect(tl.total).toBeGreaterThanOrEqual(t.end + 0.8);
    const voice: BoardVoice = { url: "blob:x", words: t.words, end: t.end, text: script.captions, voiceId: "v", voiceName: "Voice" };
    const withVoice = specTimeline({ board, voice } as unknown as AnimatedSpec).total;
    const without = specTimeline({ board } as unknown as AnimatedSpec).total;
    expect(withVoice).toBe(Math.round(tl.total * 30));
    expect(withVoice).not.toBe(without);
    // A voice that no longer fits is ignored.
    expect(specTimeline({ board, voice: { ...voice, text: "old words" } } as unknown as AnimatedSpec).total).toBe(without);
  });
});
