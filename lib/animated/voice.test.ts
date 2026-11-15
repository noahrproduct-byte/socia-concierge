import { describe, expect, it } from "vitest";
import { boardTimeline, cleanBoard } from "./board";
import { EXAMPLE_BOARD } from "./board.example";
import { specTimeline, type AnimatedSpec } from "./spec";
import { voiceFits, voiceLabel, voiceScript, wordStarts, type BoardVoice } from "./voice";
import { levelSpeech, loudnessLufs, voiceTargetLufs, wavBytes } from "./loudness";

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

describe("the voice picker's names", () => {
  it("shows the name and a few words", () => {
    expect(voiceLabel({ name: "Bella - Professional, Bright, Warm", description: "This voice is warm, bright, and professional, characterised by clarity." })).toEqual({ name: "Bella", traits: "professional, bright, warm", label: "Bella (professional, bright, warm)" });
    expect(voiceLabel({ name: "River - Relaxed, Neutral, Informative", description: "" }).label).toBe("River (relaxed, neutral, informative)");
  });
  it("falls back to the description, then to the name alone", () => {
    expect(voiceLabel({ name: "Charlie", description: "A young Australian male with a confident and energetic voice." }).label).toBe("Charlie (young australian male)");
    expect(voiceLabel({ name: "Sam", description: "" }).label).toBe("Sam");
    expect(voiceLabel({ name: "Sam" }).name).toBe("Sam");
  });
});

describe("a voiceover's level", () => {
  const rate = 44100;
  /** Speech-like sound: a 220 Hz tone that swells and stops, a syllable at a time. */
  const speech = (amp: number, seconds = 4) => Float32Array.from({ length: rate * seconds }, (_, i) => {
    const t = i / rate, syllable = Math.max(0, Math.sin(2 * Math.PI * 3 * t));
    return amp * syllable * (Math.sin(2 * Math.PI * 220 * t) + 0.4 * Math.sin(2 * Math.PI * 1760 * t));
  });
  const peak = (x: Float32Array) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  it("measures louder sound as louder, and silence as nothing", () => {
    const quiet = loudnessLufs([speech(0.05)], rate), loud = loudnessLufs([speech(0.1)], rate);
    expect(loud - quiet).toBeCloseTo(6.02, 1);
    expect(loudnessLufs([new Float32Array(rate * 2)], rate)).toBe(-Infinity);
    expect(loudnessLufs([new Float32Array(100)], rate)).toBe(-Infinity);
  });
  it("brings a quiet voice up to the target", () => {
    const r = levelSpeech([speech(0.25)], rate, -14.5);
    expect(r.from).toBeLessThan(-19);
    expect(r.to).toBeCloseTo(-14.5, 0);
    expect(r.gainDb).toBeGreaterThan(4);
    // A very quiet recording is raised by a bounded amount, not all the way.
    expect(levelSpeech([speech(0.01)], rate, -14.5).gainDb).toBe(14);
  });
  it("never lets a peak past the ceiling, even when the target needs more", () => {
    const r = levelSpeech([speech(0.3)], rate, -6, -1);
    expect(peak(r.channels[0])).toBeLessThanOrEqual(10 ** (-1 / 20) + 1e-6);
    expect(r.to).toBeGreaterThan(r.from);
  });
  it("levels a one-channel voice lower, because it plays on both sides of the video", () => {
    expect(voiceTargetLufs(1)).toBe(-17);
    expect(voiceTargetLufs(2)).toBe(-14);
    expect(levelSpeech([speech(0.25)], rate).to).toBeCloseTo(-17, 0);
    const side = speech(0.25);
    expect(levelSpeech([side, side], rate).to).toBeCloseTo(-14, 0);
  });
  it("turns a voice that is too loud down, and leaves silence alone", () => {
    expect(levelSpeech([speech(0.6)], rate, -20).gainDb).toBeLessThan(0);
    const silent = [new Float32Array(rate)];
    expect(levelSpeech(silent, rate).channels).toBe(silent);
  });
  it("writes a WAV file a browser can play", () => {
    const wav = wavBytes([Float32Array.from([0, 1, -1, 0.5])], rate);
    const v = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe("WAVE");
    expect(v.getUint32(24, true)).toBe(rate);
    expect(v.getUint16(22, true)).toBe(1);
    expect(wav.length).toBe(44 + 8);
    expect(v.getInt16(46, true)).toBe(32767);
    expect(v.getInt16(48, true)).toBe(-32768);
  });
});
