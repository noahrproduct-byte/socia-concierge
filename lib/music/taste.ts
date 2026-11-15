// The music mixed into a cut: one track from the person's own playlist
// (lib/music/tracks.ts), at the two levels they set. Pure.

/** The track mixed into the cut, and the two levels the person sets each time. */
export type Soundtrack = {
  trackId: string; name: string; path: string; musicVolume: number; originalVolume: number;
  /** Lower the music while someone is speaking and bring it up between (lib/studioClips/musicDuck.ts). Absent = one level throughout. */
  duck?: boolean;
};

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
  return { trackId: o.trackId, name: t.name, path: t.path, musicVolume: level(o.musicVolume, 0.6), originalVolume: level(o.originalVolume, 1), ...(o.duck === true ? { duck: true } : {}) };
}

/** Levels for a track as it is first added: low under real speech, otherwise the music leads and the room sits under it. */
export const startLevels = (speech: boolean) => (speech ? { musicVolume: 0.35, originalVolume: 1 } : { musicVolume: 0.85, originalVolume: 0.2 });

/** Words before music treats a cut as talking and sits under it. */
const MIN_SPEECH_WORDS = 8;
/** Whether the cut has enough spoken words (from the clips' transcripts) to count as talking. */
export function cutSpeaks(segments: { clipId: string; in: number; out: number }[], words: Record<string, { startMs: number }[] | null | undefined>, minWords = MIN_SPEECH_WORDS): boolean {
  const n = segments.reduce((a, s) => a + (words[s.clipId] ?? []).filter((w) => w.startMs / 1000 >= s.in && w.startMs / 1000 < s.out).length, 0);
  return n >= minWords;
}
