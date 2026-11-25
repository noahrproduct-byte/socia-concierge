// AI-made music for one video: the description sent to the music service
// (lib/music/elevenMusic.ts) built from what SOCIA measured in the reference
// (lib/music/referenceMusic.ts) and the person's own words for the mood, and
// the length it is made at. Always instrumental: words would fight the
// captions and any voice. It never names a song or an artist: the reference's
// music is described only by its tempo, its energy and where it lifts.
// Pure and browser-safe, so the card can show the price and the length before
// anything is made.
import type { ReferenceMusic } from "./referenceMusic";

/** Shortest and longest music made for one video, seconds (the service allows 3 s to 10 min). */
export const AI_MUSIC_MIN_SEC = 10;
export const AI_MUSIC_MAX_SEC = 60;
export const MOOD_MAX = 160;

/** The length to make: the video's, plus a second to fade on, inside the limits. */
export const aiMusicSeconds = (videoSec: number) => Math.min(AI_MUSIC_MAX_SEC, Math.max(AI_MUSIC_MIN_SEC, Math.round((Number.isFinite(videoSec) ? videoSec : 0) + 1)));

/** The person's mood words, cleaned: one line, no em dashes, at most MOOD_MAX characters. */
export const cleanMood = (v: unknown) => (typeof v === "string" ? v.replace(/\s*[\u2014\u2013]\s*/g, ", ").replace(/\s+/g, " ").trim().slice(0, MOOD_MAX) : "");

const clock = (sec: number) => { const s = Math.max(0, Math.round(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/** What the reference's music is like, in a few plain words (from its tempo and how often it lifts). */
export function energyWords(m: Pick<ReferenceMusic, "bpm" | "drops" | "speechShare"> | null): string {
  if (!m?.bpm) return "steady and warm";
  if (m.bpm >= 118 || m.drops.length >= 2) return "upbeat and energetic";
  if (m.bpm <= 90) return "calm and relaxed";
  return "steady and warm";
}

/** The description the music is made from. */
export function musicPrompt(args: { reference: Pick<ReferenceMusic, "bpm" | "drops" | "speechShare" | "musicLikely"> | null; mood?: string; seconds: number }): string {
  const ref = args.reference?.musicLikely ? args.reference : null;
  const mood = cleanMood(args.mood);
  const parts = [`Instrumental background music for a ${args.seconds}-second social media video.`];
  if (mood) parts.push(`Mood and style: ${mood}.`);
  parts.push(ref?.bpm ? `About ${ref.bpm} BPM, ${energyWords(ref)}, with a clear steady beat to cut on.` : `${energyWords(ref).replace(/^./, (c) => c.toUpperCase())}, with a clear steady beat to cut on.`);
  const lifts = (ref?.drops ?? []).filter((d) => d > 0.5 && d < args.seconds - 1);
  if (lifts.length) parts.push(`The energy lifts at ${lifts.map(clock).join(" and ")}.`);
  if ((ref?.speechShare ?? 0) >= 0.2) parts.push("Leave room for someone talking over it: simple, not busy.");
  parts.push("Starts right away, no long intro; ends cleanly. No vocals.");
  return parts.join(" ");
}

/** The name the sound is saved under in the library. */
export function aiMusicName(args: { mood?: string; bpm?: number | null }): string {
  const mood = cleanMood(args.mood);
  const base = mood ? mood.replace(/[.,;:!?].*$/, "").slice(0, 40) : args.bpm ? `${args.bpm} BPM` : "Background";
  return `AI music: ${base}`;
}
