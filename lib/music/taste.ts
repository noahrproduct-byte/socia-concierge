// The music mixed into a cut: one track from the person's own playlist
// (lib/music/tracks.ts), at the two levels they set. Pure.

/** The track mixed into the cut, and the two levels the person sets each time. */
export type Soundtrack = {
  trackId: string; name: string; path: string; musicVolume: number; originalVolume: number;
  /** Lower the music while someone is speaking and bring it up between (lib/studioClips/musicDuck.ts). Absent = one level throughout. */
  duck?: boolean;
  /** Where in the sound this video's music starts, seconds (lib/music/bestPart.ts). Absent = from the start. */
  startSec?: number;
};

/** The longest a playlist sound can be (lib/music/tracks.ts MAX_TRACK_SEC), so the furthest a start can be. */
const MAX_START_SEC = 180;
/** A saved start: seconds into the sound, rounded to a tenth; 0 or nonsense leaves it out. */
export function startOf(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return undefined;
  return Math.round(Math.min(MAX_START_SEC, v) * 10) / 10;
}

const level = (x: unknown, d: number) => (typeof x === "number" && Number.isFinite(x) ? Math.round(Math.min(1, Math.max(0, x)) * 100) / 100 : d);

/**
 * A soundtrack as saved: the track must be one the person owns (`resolve` gives its name and path, or null), or the
 * one already on the cut (`current`: a save from a browser that only moved the levels keeps the track as it is).
 */
export function sanitizeSoundtrack(v: unknown, current: Soundtrack | null | undefined, resolve: (trackId: string) => { name: string; path: string } | null): Soundtrack | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.trackId !== "string") return null;
  const t = current && current.trackId === o.trackId ? { name: current.name, path: current.path } : resolve(o.trackId);
  if (!t) return null;
  return { trackId: o.trackId, name: t.name, path: t.path, musicVolume: level(o.musicVolume, 0.6), originalVolume: level(o.originalVolume, 1), ...(o.duck === true ? { duck: true } : {}), ...(startOf(o.startSec) ? { startSec: startOf(o.startSec) } : {}) };
}

/** Levels for a track as it is first added: low under real speech, otherwise the music leads and the room sits under it. */
export const startLevels = (speech: boolean) => (speech ? { musicVolume: 0.35, originalVolume: 1 } : { musicVolume: 0.85, originalVolume: 0.2 });

/** Words before music treats a cut as talking and sits under it. */
const MIN_SPEECH_WORDS = 8;
/** Whether the cut has enough spoken words (from the clips' transcripts) to count as talking. */
export function cutSpeaks(segments: { clipId: string; in: number; out: number; volume?: number }[], words: Record<string, { startMs: number }[] | null | undefined>, minWords = MIN_SPEECH_WORDS): boolean {
  // Only words that are heard count: a shot whose sound is off has no voice for the music to sit under.
  const n = segments.reduce((a, s) => a + (s.volume === 0 ? 0 : (words[s.clipId] ?? []).filter((w) => w.startMs / 1000 >= s.in && w.startMs / 1000 < s.out).length), 0);
  return n >= minWords;
}
