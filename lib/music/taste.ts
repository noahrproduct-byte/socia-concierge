// Music for a video: a short playlist of original tracks made for it, from
// the account's taste. The taste is facts, never guesses: what SOCIA measured
// on the account's best posts (tempo range, energy, how much music), whether
// library music or original sound has done better against its own median,
// what the video is (length, speech), and the tracks the person picked
// before. A model turns those into track descriptions; a music model
// (ElevenLabs) makes each one. Nothing names an artist or a song. Pure.

export type Energy = "low" | "medium" | "high";
export type MusicPick = { style: string; mood: string; bpm: number | null; energy: Energy; at: string };

export type TasteInput = {
  /** the account's best measured posts (lib/audio/insights AccountAudio.profile) */
  profile: { basedOn: number; bpmRange: [number, number] | null; energy: Energy | null; musicShare: number | null } | null;
  /** library music vs original sound, against the account's own median */
  library: { n: number; medianMultiplier: number | null } | null;
  original: { n: number; medianMultiplier: number | null } | null;
  picks: MusicPick[];
  videoSec: number;
  hasSpeech: boolean;
  /** the cut's own music note (EDL `music`), a style only */
  cutNote: string | null;
  niche: string | null;
};

export type TrackBrief = {
  id: string;
  name: string;
  style: string;
  mood: string;
  bpm: number;
  energy: Energy;
  instruments: string;
  why: string;
};
export type SoundSuggestion = { search: string; why: string };
export type Playlist = { taste: string[]; tracks: TrackBrief[]; suggestions: SoundSuggestion[]; createdAt: string };
/** The track mixed into the cut, and the two levels the person sets each time. */
export type Soundtrack = { trackId: string; name: string; path: string; musicVolume: number; originalVolume: number };

export const PLAYLIST_SIZE = 6;
export const MAX_PICKS = 20;
export const MIN_TRACK_SEC = 10;
export const MAX_TRACK_SEC = 120;

const fmtX = (m: number) => `${m >= 10 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, "")}×`;

/** The taste, as the plain lines the person sees above the playlist (and the model reads). */
export function tasteLines(t: TasteInput): string[] {
  const out: string[] = [];
  if (t.profile && (t.profile.bpmRange || t.profile.energy)) {
    out.push(`Your best measured posts (${t.profile.basedOn}) run ${t.profile.bpmRange ? `${t.profile.bpmRange[0]} to ${t.profile.bpmRange[1]} BPM` : "with no steady beat"}${t.profile.energy ? `, ${t.profile.energy} energy` : ""}${t.profile.musicShare != null ? `, with music in ${Math.round(t.profile.musicShare * 100)}% of them` : ""}.`);
  }
  if (t.library?.medianMultiplier != null && t.original?.medianMultiplier != null && t.library.n >= 3 && t.original.n >= 3) {
    const lib = t.library.medianMultiplier, own = t.original.medianMultiplier;
    out.push(lib >= own ? `Posts with music have done ${fmtX(lib)} your median, original sound ${fmtX(own)}.` : `Original sound has done ${fmtX(own)} your median, posts with music ${fmtX(lib)}: keep the music low under what's said.`);
  }
  if (t.picks.length) {
    const recent = t.picks.slice(0, 5);
    out.push(`You've picked ${recent.map((p) => `${p.mood} ${p.style}${p.bpm ? ` (${p.bpm} BPM)` : ""}`).join(", ")}${t.picks.length > 5 ? ` and ${t.picks.length - 5} more` : ""}.`);
  }
  out.push(`This video: ${Math.round(t.videoSec)} seconds, ${t.hasSpeech ? "with speech, so the tracks are instrumental and sit under the voice" : "no speech"}.`);
  if (!t.profile && !t.picks.length) out.push("SOCIA hasn't measured your posts' sound yet and you haven't picked a track before, so this first playlist goes wide.");
  return out;
}

/** Remember a pick, newest first, without repeats of the same style and mood. */
export function addPick(picks: MusicPick[], pick: MusicPick): MusicPick[] {
  const key = (p: MusicPick) => `${p.style.toLowerCase()}|${p.mood.toLowerCase()}`;
  return [pick, ...picks.filter((p) => key(p) !== key(pick))].slice(0, MAX_PICKS);
}

/** Stored picks, bounded; anything malformed is dropped. */
export function sanitizePicks(v: unknown): MusicPick[] {
  return (Array.isArray(v) ? v : []).flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    const style = clean(o.style, 60), mood = clean(o.mood, 40);
    if (!style || !mood) return [];
    const energy = (["low", "medium", "high"] as const).includes(o.energy as Energy) ? (o.energy as Energy) : "medium";
    const bpm = typeof o.bpm === "number" && o.bpm >= 50 && o.bpm <= 200 ? Math.round(o.bpm) : null;
    return [{ style, mood, bpm, energy, at: typeof o.at === "string" ? o.at.slice(0, 30) : "" }];
  }).slice(0, MAX_PICKS);
}

function clean(v: unknown, n: number): string {
  return typeof v === "string" ? v.replace(/\s*\u2014\s*/g, ", ").replace(/[<>"]/g, "").replace(/\s+/g, " ").trim().slice(0, n) : "";
}

export const PLAYLIST_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    tracks: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          name: { type: "string" }, style: { type: "string" }, mood: { type: "string" }, bpm: { type: "integer" },
          energy: { type: "string", enum: ["low", "medium", "high"] }, instruments: { type: "string" }, why: { type: "string" },
        },
        required: ["name", "style", "mood", "bpm", "energy", "instruments", "why"],
      },
    },
    suggestions: {
      type: "array",
      items: { type: "object", additionalProperties: false, properties: { search: { type: "string" }, why: { type: "string" } }, required: ["search", "why"] },
    },
  },
  required: ["tracks", "suggestions"],
} as const;

/** The model's track list, bounded, with stable ids. */
export function cleanPlaylist(raw: unknown, ids: () => string): { tracks: TrackBrief[]; suggestions: SoundSuggestion[] } {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const tracks = (Array.isArray(o.tracks) ? o.tracks : []).flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const t = x as Record<string, unknown>;
    const name = clean(t.name, 50), style = clean(t.style, 60), mood = clean(t.mood, 40), instruments = clean(t.instruments, 140);
    if (!name || !style || !mood) return [];
    const bpm = typeof t.bpm === "number" ? Math.round(Math.min(180, Math.max(60, t.bpm))) : 100;
    const energy = (["low", "medium", "high"] as const).includes(t.energy as Energy) ? (t.energy as Energy) : "medium";
    return [{ id: ids(), name, style, mood, bpm, energy, instruments, why: clean(t.why, 200) }];
  }).slice(0, PLAYLIST_SIZE);
  const suggestions = (Array.isArray(o.suggestions) ? o.suggestions : []).flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const s = x as Record<string, unknown>;
    const search = clean(s.search, 60);
    return search ? [{ search, why: clean(s.why, 160) }] : [];
  }).slice(0, 4);
  return { tracks, suggestions };
}

/** What the music model is asked for: how it sounds, never an artist or a song. */
export function trackPrompt(t: TrackBrief, seconds: number, underSpeech: boolean): { prompt: string; lengthMs: number } {
  const sec = Math.round(Math.min(MAX_TRACK_SEC, Math.max(MIN_TRACK_SEC, seconds)));
  const prompt = `${t.mood} ${t.style} instrumental${t.instruments ? ` with ${t.instruments}` : ""}, about ${t.bpm} BPM, ${t.energy} energy, ${sec} seconds, for a short vertical social video${underSpeech ? "; leave space in the mid-range so a voice sits clearly on top" : ""}. Clean modern production, a clear start and a tidy ending.`;
  return { prompt: prompt.slice(0, 600), lengthMs: sec * 1000 };
}

/**
 * A soundtrack from the browser, checked against this cut's playlist; the
 * file path is always derived on the server (pathFor), never taken from the
 * request. Levels bounded 0 to 1.
 */
export function sanitizeSoundtrack(v: unknown, playlist: Playlist | null | undefined, pathFor: (trackId: string) => string): Soundtrack | null {
  if (!v || typeof v !== "object" || !playlist) return null;
  const o = v as Record<string, unknown>;
  const track = playlist.tracks.find((t) => t.id === o.trackId);
  if (!track) return null;
  const level = (x: unknown, d: number) => (typeof x === "number" && Number.isFinite(x) ? Math.round(Math.min(1, Math.max(0, x)) * 100) / 100 : d);
  return { trackId: track.id, name: track.name, path: pathFor(track.id), musicVolume: level(o.musicVolume, 0.6), originalVolume: level(o.originalVolume, 1) };
}

/** Where a track's MP3 lives in the private studio bucket: beside the project's clips. */
export const musicPath = (ownerId: string, projectId: string, buildId: string, trackId: string) => `${ownerId}/${projectId}/music/${buildId}-${trackId}.mp3`;

/** Stored playlist, bounded (it lives on the cut). */
export function sanitizePlaylist(v: unknown): Playlist | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const tracks = (Array.isArray(o.tracks) ? o.tracks : []).flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const t = x as Record<string, unknown>;
    if (typeof t.id !== "string" || !/^m[0-9a-z]{4,20}$/.test(t.id)) return [];
    const name = clean(t.name, 50), style = clean(t.style, 60), mood = clean(t.mood, 40);
    if (!name || !style || !mood) return [];
    const energy = (["low", "medium", "high"] as const).includes(t.energy as Energy) ? (t.energy as Energy) : "medium";
    return [{ id: t.id, name, style, mood, bpm: typeof t.bpm === "number" ? Math.round(t.bpm) : 100, energy, instruments: clean(t.instruments, 140), why: clean(t.why, 200) }];
  }).slice(0, PLAYLIST_SIZE + 1);
  if (!tracks.length) return null;
  const taste = (Array.isArray(o.taste) ? o.taste : []).filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 240)).slice(0, 6);
  const suggestions = (Array.isArray(o.suggestions) ? o.suggestions : []).flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const s = x as Record<string, unknown>;
    const search = clean(s.search, 60);
    return search ? [{ search, why: clean(s.why, 160) }] : [];
  }).slice(0, 4);
  return { taste, tracks, suggestions, createdAt: typeof o.createdAt === "string" ? o.createdAt.slice(0, 30) : "" };
}
