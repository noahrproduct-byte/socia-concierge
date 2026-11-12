import { describe, expect, it } from "vitest";
import {
  alignmentToWords, cleanLine, fitScript, linesToVoice, mergeVoiceover, needsVoiceover, ownsVoicePath, pickDefaultVoice,
  placeLines, sanitizeVoiceover, trimToWords, voiceKey, voicePath, voiceSpans, wordBudget, LINE_GAP, MAX_LINES, UNDER_VOICEOVER, VOICE_WPS,
} from "./voiceover";
import { duckLevel, DUCK } from "./musicDuck";
import { captionsForEdl } from "./timeline";
import type { Edl, TranscriptWord, Voiceover } from "./types";

const edl = (over: Partial<Edl> = {}): Edl => ({
  version: 1, fps: 30, width: 1080, height: 1920, targetSec: { min: 5, max: 30 }, text: [], captions: null, enhance: [], audio: [], cta: null, music: null, caption: "", notes: [],
  segments: [{ id: "s1", clipId: "a", in: 0, out: 5, role: "opener", note: "pizza on the peel" }, { id: "s2", clipId: "b", in: 0, out: 5, role: "body", note: "the first cut" }, { id: "s3", clipId: "a", in: 6, out: 10, role: "ending", note: "slices boxed" }],
  ...over,
});
const say = (text: string, from = 0): TranscriptWord[] => text.split(" ").map((t, i) => ({ text: t, startMs: (from + i * 0.4) * 1000, endMs: (from + i * 0.4 + 0.35) * 1000, confidence: 1 }));
const vo = (over: Partial<Voiceover> = {}): Voiceover => ({
  on: true, voiceId: "voiceA1", voiceName: "Ava", volume: 1,
  lines: [
    { id: "v1", at: 0.2, text: "Fresh from the deck", path: "u/p/voice/b-v1-x.mp3", dur: 1.6, words: [{ text: "Fresh", start: 0, end: 0.4 }, { text: "from", start: 0.4, end: 0.6 }, { text: "the", start: 0.6, end: 0.7 }, { text: "deck", start: 0.7, end: 1.2 }], voiced: { text: "Fresh from the deck", voiceId: "voiceA1" } },
    { id: "v2", at: 6, text: "Every slice cut by hand", path: "u/p/voice/b-v2-y.mp3", dur: 2, words: [], voiced: { text: "Every slice cut by hand", voiceId: "voiceA1" } },
  ],
  ...over,
});

describe("which cuts get a voice", () => {
  it("never when someone already talks, or the brief says no", () => {
    expect(needsVoiceover(edl({ editStyle: "demo" }), { a: say("this is how we make the dough every single morning before we open", 0), b: say("and then it goes in the oven for ninety seconds at high heat", 0) }))
      .toEqual({ need: false, why: "someone already talks in it" });
    expect(needsVoiceover(edl({ editStyle: "demo" }), {}, "A quick demo, no voiceover please").need).toBe(false);
    expect(needsVoiceover(edl(), {}, "without narration, just music").need).toBe(false);
  });
  it("when the brief asks, for a demo, and for a process cut that sets out to explain", () => {
    expect(needsVoiceover(edl(), {}, "add a voiceover that walks through the steps")).toEqual({ need: true, why: "you asked for a voiceover" });
    expect(needsVoiceover(edl({ editStyle: "demo" }), {}).need).toBe(true);
    expect(needsVoiceover(edl(), {}, "show how we make our pizza dough").need).toBe(true);
  });
  it("not for a food cut the music carries, or a calm one", () => {
    expect(needsVoiceover(edl(), {}, "make this post ready with music and good on screen text")).toEqual({ need: false, why: "the footage and music carry it" });
    expect(needsVoiceover(edl({ editStyle: "calm" }), {}, "show how the room looks at night").need).toBe(false);
  });
});

describe("the script", () => {
  it("tidies a model's line: no dashes, no wrapping quotes", () => {
    expect(cleanLine("“Fresh from the deck — every night”")).toBe("Fresh from the deck, every night");
  });
  it("trims at a whole word and never ends on a small word", () => {
    expect(trimToWords("Pulled from the deck and boxed hot", 5)).toBe("Pulled from the deck");
    expect(trimToWords("Pulled from the deck and boxed hot", 3)).toBe("Pulled");
    expect(trimToWords("Pulled hot", 5)).toBe("Pulled hot");
  });
  it("fits each line into the time before the next one, first on the opening shot", () => {
    const lines = fitScript({ lines: [{ at: 4.8, text: "Then the wheel goes through, eight clean slices, still steaming, every single time we make one" }, { at: 1.2, text: "Straight off the deck" }, { at: 12.5, text: "Come tonight" }] }, 14);
    expect(lines.map((l) => l.id)).toEqual(["v1", "v2", "v3"]);
    expect(lines[0]).toMatchObject({ at: 0.3, text: "Straight off the deck" });
    const room = Math.floor((12.5 - LINE_GAP - 4.8) * VOICE_WPS);
    expect(lines[1].text.split(" ").length).toBeLessThanOrEqual(room);
    expect(lines[1].text.startsWith("Then the wheel goes through")).toBe(true);
    expect(lines[2].text).toBe("Come tonight");
    // Too long for the 0.95 s left: trimmed to "Come", one word, and dropped.
    expect(fitScript({ lines: [{ at: 0, text: "Fresh dough" }, { at: 12.5, text: "Come by tonight" }] }, 14).map((l) => l.text)).toEqual(["Fresh dough"]);
  });
  it("drops lines with no room, too close to the last, or too short, and caps the count", () => {
    const close = fitScript({ lines: [{ at: 0, text: "Fresh dough" }, { at: 0.4, text: "Right here" }, { at: 3, text: "Hot" }] }, 10);
    expect(close.map((l) => l.text)).toEqual(["Fresh dough"]);
    const many = fitScript({ lines: Array.from({ length: 20 }, (_, i) => ({ at: i * 2, text: "one more great line" })) }, 40);
    expect(many.length).toBeLessThanOrEqual(MAX_LINES);
    expect(fitScript(null, 10)).toEqual([]);
    expect(fitScript({ lines: [{ at: 0, text: "x y" }] }, 1)).toEqual([]);
  });
  it("leaves room in the word budget", () => {
    expect(wordBudget(14)).toBe(Math.floor((14 - 0.6) * VOICE_WPS * 0.85));
    expect(wordBudget(0)).toBe(0);
  });
});

describe("voiced lines", () => {
  it("turns ElevenLabs' character timings into words", () => {
    const chars = "Hi there".split("");
    const words = alignmentToWords({ characters: chars, character_start_times_seconds: chars.map((_, i) => i * 0.1), character_end_times_seconds: chars.map((_, i) => i * 0.1 + 0.1) });
    expect(words).toEqual([{ text: "Hi", start: 0, end: 0.2 }, { text: "there", start: 0.3, end: 0.8 }]);
    expect(alignmentToWords(null)).toEqual([]);
  });
  it("waits for the line before to finish, and says how far the voice runs past the end", () => {
    const { lines, overrunSec } = placeLines([{ id: "v1", at: 0, text: "a b", dur: 3 }, { id: "v2", at: 2, text: "c d", dur: 2 }], 4);
    expect(lines[1].at).toBe(3 + LINE_GAP);
    expect(overrunSec).toBe(1.25);
    expect(placeLines([{ id: "v1", at: 0, text: "a b", dur: 1 }], 4).overrunSec).toBe(0);
  });
  it("voices only lines whose words or voice changed", () => {
    const v = vo();
    expect(linesToVoice(v)).toEqual([]);
    expect(linesToVoice({ ...v, lines: [{ ...v.lines[0], text: "Fresh off the deck" }, v.lines[1]] }).map((l) => l.id)).toEqual(["v1"]);
    expect(linesToVoice({ ...v, voiceId: "voiceB2" }).map((l) => l.id)).toEqual(["v1", "v2"]);
  });
  it("names the audio by its words and voice, inside the cut's own folder", () => {
    expect(voiceKey("hi", "a")).toBe(voiceKey("hi", "a"));
    expect(voiceKey("hi", "a")).not.toBe(voiceKey("hi", "b"));
    const p = voicePath("u", "p", "b", { id: "v1", text: "hi" }, "a");
    expect(p.startsWith("u/p/voice/b-v1-")).toBe(true);
    expect(ownsVoicePath("u", "p", "b")(p)).toBe(true);
    expect(ownsVoicePath("u", "p", "b")("u/p/voice/other-v1-x.mp3")).toBe(false);
    expect(ownsVoicePath("u", "p", "b")("u/p/voice/b-../../x.mp3")).toBe(false);
  });
});

describe("the sound under the voice", () => {
  it("knows where the voice speaks, and nothing when it's off", () => {
    expect(voiceSpans(vo(), 10)).toEqual([{ start: 0.2, end: 1.8 }, { start: 6, end: 8 }]);
    expect(voiceSpans(vo({ on: false }), 10)).toEqual([]);
    // A line that starts after the end of a cut plays no part.
    expect(voiceSpans(vo(), 5)).toEqual([{ start: 0.2, end: 1.8 }]);
  });
  it("dips the music and the clips' sound to the voiceover level under it, full away from it", () => {
    const spans = voiceSpans(vo(), 10);
    expect(duckLevel(1, spans, UNDER_VOICEOVER)).toBe(UNDER_VOICEOVER);
    expect(duckLevel(4, spans, UNDER_VOICEOVER)).toBe(1);
    expect(duckLevel(1, spans)).toBe(DUCK.under);
  });
  it("captions the voice's words on the cut while it is on", () => {
    const cut = edl({ captions: { source: "transcript" }, voiceover: vo() });
    expect(captionsForEdl(cut, {}).map((c) => c.text.trim())).toEqual(["Fresh", "from", "the", "deck"]);
    expect(captionsForEdl(cut, {})[0].startMs).toBe(200);
    expect(captionsForEdl({ ...cut, voiceover: vo({ on: false }) }, {})).toEqual([]);
  });
});

describe("saving", () => {
  const ok = ownsVoicePath("u", "p", "b");
  it("keeps a stored voiceover bounded and drops paths that aren't this cut's", () => {
    const s = sanitizeVoiceover({ ...vo(), lines: [{ ...vo().lines[0], path: "u/p/voice/b-v1-x.mp3" }, { ...vo().lines[1], path: "someone/else.mp3" }] }, ok)!;
    expect(s.lines[0].path).toBe("u/p/voice/b-v1-x.mp3");
    expect(s.lines[1].path).toBeUndefined();
    expect(s.lines[1].words).toBeUndefined();
    expect(sanitizeVoiceover({ voiceId: "bad id!", lines: [] }, ok)).toBeUndefined();
    expect(sanitizeVoiceover({ ...vo(), volume: 9 }, ok)!.volume).toBe(1.5);
  });
  it("takes the person's switch and level from a save, never their lines or audio", () => {
    const stored = vo();
    const m = mergeVoiceover(stored, { on: false, volume: 0.6, lines: [{ id: "v1", at: 0, text: "anything", path: "x.mp3" }] })!;
    expect(m.on).toBe(false);
    expect(m.volume).toBe(0.6);
    expect(m.lines).toBe(stored.lines);
    expect(mergeVoiceover(undefined, { on: true })).toBeUndefined();
  });
  it("starts each style in the voice whose description fits it", () => {
    const voices = [{ id: "1", name: "Bram", description: "deep, narration", preview: null }, { id: "2", name: "Ava", description: "warm, friendly", preview: null }, { id: "3", name: "Zed", description: "upbeat, energetic", preview: null }];
    expect(pickDefaultVoice(voices, "process")?.id).toBe("2");
    expect(pickDefaultVoice(voices, "energetic")?.id).toBe("3");
    expect(pickDefaultVoice([], "demo")).toBeNull();
  });
});
