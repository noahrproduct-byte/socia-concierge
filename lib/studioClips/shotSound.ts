// Which shots keep their camera sound. In a cut where someone speaks, the
// voice carries it: every shot with no words of its own is a picture, and its
// camera sound (the room, the handling, the shop) was playing under the voice
// at full level, so the owner heard "two audios over each other" (rug reel,
// 2026-11-13). Here such a shot is muted, the way a hand edit lays B-roll in
// without its sound. A cut with no speech anywhere keeps every shot's sound
// (a sizzle reel is its own sound). A level the person set, or a shot the cut
// marked as "its sound matters" (sound: true), is never touched. Pure,
// unit-tested (shotSound.test.ts).
import type { TranscriptWord } from "@/lib/transcribe/types";
import type { Edl } from "./types";

export type WordsById = Record<string, TranscriptWord[] | null | undefined>;

/** A word of this clip is said inside the shot (seconds in the clip). */
export function shotHasSpeech(words: TranscriptWord[] | null | undefined, inSec: number, outSec: number): boolean {
  if (!words?.length) return false;
  const a = inSec * 1000, b = outSec * 1000;
  return words.some((w) => w.startMs < b && w.endMs > a);
}

/**
 * Shots without speech muted, in a cut that has speech somewhere. Returns the
 * cut and how many shots went quiet (0 = nothing changed, same object back).
 */
export function muteSilentShots(edl: Edl, words: WordsById): { edl: Edl; muted: number } {
  const spoken = edl.segments.map((s) => shotHasSpeech(words[s.clipId], s.in, s.out));
  // The voice only carries a cut when it can be heard: speech in a shot whose sound is switched off (background
  // chatter the cut muted as unrelated) is not a voice, and muting everything else for it left the video with
  // no sound of its own at all (Noah's pizza Reel, 2026-11-26: nine clips, kitchen talk in one, music only).
  if (!edl.segments.some((s, i) => spoken[i] && s.volume !== 0)) return { edl, muted: 0 };
  let muted = 0;
  const segments = edl.segments.map((s, i) => {
    if (spoken[i] || s.volume != null || s.sound) return s;
    muted++;
    return { ...s, volume: 0 };
  });
  return muted ? { edl: { ...edl, segments }, muted } : { edl, muted: 0 };
}

/** The line the cut's notes carry about it. */
export const SHOT_SOUND_NOTE = /^Camera sound stays off on /;
export function shotSoundNote(muted: number): string {
  if (!muted) return "";
  return `Camera sound stays off on ${muted === 1 ? "the one shot" : `${muted} shots`} where no one speaks: the voice carries the cut, and the shop noise under it is gone.`;
}
