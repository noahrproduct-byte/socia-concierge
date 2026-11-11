// A voice for a cut nobody talks in (Noah, 2026-11-11: "start implementing a
// voiceover for ones that need it"). Whether a cut needs one, the script the
// model writes bounded to the time each shot gives it, the voiced lines placed
// on the cut without running into each other, and where the voice sits so the
// music and the clips' own sound dip under it. The script says only what the
// footage shows, the brand states or the brief asks; the server checks the
// rest. Pure, unit-tested; the voicing itself is lib/voiceover/server.ts.
import { DUCK, speechShare, speechSpans, type Span } from "./musicDuck";
import { timeline } from "./timeline";
import type { Edl, TranscriptWord, VoiceLine, Voiceover, VoiceWord } from "./types";
import type { EditStyleId } from "./profiles";

/** Words a voiceover speaks a second: an unhurried read for short-form. */
export const VOICE_WPS = 2.6;
/** Silence kept between one line and the next, seconds. */
export const LINE_GAP = 0.25;
/** At most this many lines in one video. */
export const MAX_LINES = 8;
/** A line shorter than this many words isn't worth a voice. */
const MIN_WORDS = 2;
/** The clips' own sound and the music under the voice, as a share of their level. */
export const UNDER_VOICEOVER = 0.3;
export const MAX_VOICE_VOLUME = 1.5;
/** Someone talks in at least this much of the cut: the voice there is theirs, not SOCIA's. */
export const TALKS_SHARE = 0.25;

const NO_VOICE = /\b(no|without|skip|don'?t (?:add|want)(?: a| any)?)\s+(voice ?-?over|narration|narrator|voice)\b/i;
const ASKS_VOICE = /\b(voice ?-?over|narrat\w*|voiced|talk (?:it|me|them|us) through|walk (?:it|me|them|us) through)\b/i;
const EXPLAINS = /\b(how (?:to|we|i|it)|why|recipe|steps?|tutorial|explain\w*|guide|process|behind the scenes|what goes into)\b/i;

export type VoiceNeed = { need: boolean; why: string };

/**
 * Whether a cut wants a voice. Never when someone already talks in it, or the
 * brief says no. Yes when the brief asks for one, for a demo (a voice makes it
 * easy to follow), and for a process cut whose brief sets out to explain.
 */
export function needsVoiceover(edl: Edl, words: Record<string, TranscriptWord[] | null | undefined>, brief?: string | null): VoiceNeed {
  const b = brief?.trim() ?? "";
  if (NO_VOICE.test(b)) return { need: false, why: "you asked for no voiceover" };
  const total = timeline(edl).durationSec;
  if (speechShare(speechSpans(edl, words), total) >= TALKS_SHARE) return { need: false, why: "someone already talks in it" };
  if (ASKS_VOICE.test(b)) return { need: true, why: "you asked for a voiceover" };
  if (edl.editStyle === "demo") return { need: true, why: "a demo is easier to follow with a voice" };
  if ((edl.editStyle ?? "process") === "process" && EXPLAINS.test(b)) return { need: true, why: "your prompt sets out to explain how it's done" };
  return { need: false, why: "the footage and music carry it" };
}

export const SCRIPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    lines: { type: "array", items: { type: "object", additionalProperties: false, properties: { at: { type: "number" }, text: { type: "string" } }, required: ["at", "text"] } },
  },
  required: ["lines"],
} as const;

// Small words a trimmed line must not end on.
const DANGLING = new Set(["a", "an", "the", "and", "or", "but", "so", "to", "of", "in", "on", "at", "for", "with", "from", "by", "that", "this", "your", "our", "my", "its", "is", "are", "was", "it", "as", "into", "like"]);

/** Tidies a model's line: no dashes standing in for punctuation, no wrapping quotes, single spaces. */
export function cleanLine(s: string): string {
  return s.replace(/\s*[—–]\s*/g, ", ").replace(/^["'“‘]+|["'”’]+$/g, "").replace(/\s+/g, " ").trim();
}

/** The first `max` words, never ending on a word like "the" or "and". */
export function trimToWords(text: string, max: number): string {
  const words = text.split(" ").filter(Boolean);
  if (words.length <= max) return words.join(" ");
  const kept = words.slice(0, Math.max(0, max));
  while (kept.length && DANGLING.has(kept[kept.length - 1].toLowerCase().replace(/[^\p{L}']/gu, ""))) kept.pop();
  return kept.join(" ").replace(/[,;:]+$/, "");
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const words = (s: string) => s.split(" ").filter(Boolean).length;

/**
 * The model's script as lines that fit the cut: in order, the first on the
 * opening shot, each no longer than the time until the next can be spoken at
 * VOICE_WPS (trimmed at a whole word), lines too close or too short dropped.
 */
export function fitScript(raw: unknown, totalSec: number): VoiceLine[] {
  const list = (raw as { lines?: unknown } | null)?.lines;
  if (!Array.isArray(list) || totalSec < 2) return [];
  const parsed = list
    .map((l) => ({ at: Number((l as { at?: unknown }).at), text: cleanLine(String((l as { text?: unknown }).text ?? "")) }))
    .filter((l) => Number.isFinite(l.at) && l.text)
    .map((l) => ({ ...l, at: Math.min(Math.max(0, l.at), totalSec - 1) }))
    .sort((a, b) => a.at - b.at);
  if (!parsed.length) return [];
  parsed[0].at = Math.min(parsed[0].at, 0.3);
  const spaced: typeof parsed = [];
  for (const l of parsed) {
    const prev = spaced[spaced.length - 1];
    if (prev && l.at - prev.at < MIN_WORDS / VOICE_WPS + LINE_GAP) continue;
    spaced.push(l);
  }
  const out: VoiceLine[] = [];
  spaced.slice(0, MAX_LINES).forEach((l, i, all) => {
    const until = (all[i + 1]?.at ?? totalSec - 0.3) - LINE_GAP;
    const max = Math.floor((until - l.at) * VOICE_WPS);
    const text = trimToWords(l.text, max);
    if (words(text) < MIN_WORDS) return;
    out.push({ id: `v${out.length + 1}`, at: r2(l.at), text });
  });
  return out;
}

/** ElevenLabs' character timings for one line, as words with start and end seconds. */
export function alignmentToWords(a: { characters?: unknown; character_start_times_seconds?: unknown; character_end_times_seconds?: unknown } | null | undefined): VoiceWord[] {
  const ch = Array.isArray(a?.characters) ? (a!.characters as unknown[]) : [];
  const st = Array.isArray(a?.character_start_times_seconds) ? (a!.character_start_times_seconds as unknown[]) : [];
  const en = Array.isArray(a?.character_end_times_seconds) ? (a!.character_end_times_seconds as unknown[]) : [];
  const out: VoiceWord[] = [];
  let cur: VoiceWord | null = null;
  ch.forEach((c, i) => {
    const s = Number(st[i]), e = Number(en[i]);
    if (typeof c !== "string" || !Number.isFinite(s) || !Number.isFinite(e)) return;
    if (/\s/.test(c)) { if (cur) { out.push(cur); cur = null; } return; }
    if (!cur) cur = { text: c, start: s, end: e };
    else { cur.text += c; cur.end = e; }
  });
  if (cur) out.push(cur);
  return out.map((w) => ({ text: w.text, start: r2(w.start), end: r2(w.end) }));
}

/**
 * Voiced lines placed on the cut: a line that would start before the one
 * before it has finished waits for it. Returns how far the last line runs past
 * the end of the cut (0 when it all fits).
 */
export function placeLines(lines: VoiceLine[], totalSec: number): { lines: VoiceLine[]; overrunSec: number } {
  let prevEnd = -Infinity;
  const placed = lines.map((l) => {
    const at = r2(Math.max(l.at, prevEnd + LINE_GAP));
    prevEnd = at + (l.dur ?? words(l.text) / VOICE_WPS);
    return at === l.at ? l : { ...l, at };
  });
  return { lines: placed, overrunSec: r2(Math.max(0, prevEnd - totalSec)) };
}

/** Where the voice speaks on the cut, with short gaps closed, for the sound under it to dip. */
export function voiceSpans(vo: Voiceover | null | undefined, totalSec: number): Span[] {
  if (!vo?.on) return [];
  const raw = vo.lines
    .filter((l) => l.path && l.dur && l.at < totalSec)
    .map((l) => ({ start: l.at, end: Math.min(totalSec, l.at + (l.dur ?? 0)) }))
    .sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  for (const r of raw) {
    const last = out[out.length - 1];
    if (last && r.start - last.end < DUCK.minGapSec) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

/** The lines that need voicing: never voiced, or their text or the voice changed since. */
export const linesToVoice = (vo: Voiceover): VoiceLine[] => vo.lines.filter((l) => !l.path || !l.voiced || l.voiced.text !== l.text || l.voiced.voiceId !== vo.voiceId);

/** Short, stable key for a line's audio: the same words in the same voice are never paid for twice. */
export function voiceKey(text: string, voiceId: string): string {
  let h = 0x811c9dc5;
  for (const c of `${voiceId}\u0000${text}`) { h ^= c.codePointAt(0)!; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}

export const voicePath = (ownerId: string, projectId: string, buildId: string, line: Pick<VoiceLine, "id" | "text">, voiceId: string): string =>
  `${ownerId}/${projectId}/voice/${buildId}-${line.id}-${voiceKey(line.text, voiceId)}.mp3`;

/** Whether a stored path is one of this cut's voice files. */
export const ownsVoicePath = (ownerId: string, projectId: string, buildId: string) => (p: string): boolean => p.startsWith(`${ownerId}/${projectId}/voice/${buildId}-`) && !p.includes("..");

const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** A stored voiceover, bounded. Undefined when it isn't one. `pathOk` says whether a stored path belongs to this cut. */
export function sanitizeVoiceover(v: unknown, pathOk: (p: string) => boolean): Voiceover | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const voiceId = str(o.voiceId, 64);
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(voiceId) || !Array.isArray(o.lines)) return undefined;
  const lines: VoiceLine[] = (o.lines as unknown[]).slice(0, MAX_LINES).flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const l = x as Record<string, unknown>;
    const id = str(l.id, 12), text = cleanLine(str(l.text, 400));
    if (!/^v\d{1,3}$/.test(id) || !text) return [];
    const line: VoiceLine = { id, at: r2(num(l.at, 0, 600, 0)), text };
    if (typeof l.path === "string" && pathOk(l.path)) line.path = l.path;
    if (line.path && typeof l.dur === "number" && l.dur > 0) line.dur = r2(Math.min(120, l.dur));
    if (line.path && Array.isArray(l.words)) line.words = (l.words as VoiceWord[]).slice(0, 200).filter((w) => w && typeof w.text === "string" && Number.isFinite(w.start) && Number.isFinite(w.end)).map((w) => ({ text: w.text.slice(0, 40), start: r2(w.start), end: r2(w.end) }));
    const vd = l.voiced as { text?: unknown; voiceId?: unknown } | undefined;
    if (line.path && vd && typeof vd.text === "string" && typeof vd.voiceId === "string") line.voiced = { text: vd.text.slice(0, 400), voiceId: vd.voiceId.slice(0, 64) };
    return [line];
  });
  if (!lines.length) return undefined;
  const why = str(o.why, 120);
  return { on: o.on !== false, voiceId, voiceName: str(o.voiceName, 60) || "Voice", volume: r2(num(o.volume, 0, MAX_VOICE_VOLUME, 1)), lines, ...(why ? { why } : {}) };
}

/**
 * A save from the editor: the voice's lines and audio stay the server's (only
 * voicing changes them); the person's switch and level come through.
 */
export function mergeVoiceover(stored: Voiceover | undefined, edited: unknown): Voiceover | undefined {
  if (!stored) return undefined;
  if (edited === null) return undefined;
  const e = (edited && typeof edited === "object" ? edited : {}) as { on?: unknown; volume?: unknown };
  return { ...stored, on: typeof e.on === "boolean" ? e.on : stored.on, volume: r2(num(e.volume, 0, MAX_VOICE_VOLUME, stored.volume)) };
}

export type VoiceChoice = { id: string; name: string; description: string; preview: string | null };

// What each editing style wants to hear, matched against a voice's own description.
const VOICE_TASTE: Record<EditStyleId, string[]> = {
  process: ["warm", "calm", "friendly", "soft", "narrat"],
  calm: ["calm", "soft", "warm", "gentle", "narrat"],
  demo: ["clear", "confident", "professional", "friendly", "narrat"],
  talking: ["clear", "friendly", "conversational", "narrat"],
  energetic: ["upbeat", "energetic", "excited", "young", "confident"],
};

/** The voice a cut starts with: the one whose description best matches its style; the first when none do. */
export function pickDefaultVoice(voices: VoiceChoice[], style: EditStyleId | null | undefined): VoiceChoice | null {
  if (!voices.length) return null;
  const want = VOICE_TASTE[style ?? "process"] ?? VOICE_TASTE.process;
  let best = voices[0], score = -1;
  for (const v of voices) {
    const d = `${v.name} ${v.description}`.toLowerCase();
    const s = want.reduce((a, w, i) => a + (d.includes(w) ? want.length - i : 0), 0);
    if (s > score) { best = v; score = s; }
  }
  return best;
}

/** How much speaking a cut of this length has room for, in words, for the script prompt. */
export const wordBudget = (totalSec: number): number => Math.max(0, Math.floor((totalSec - 0.6) * VOICE_WPS * 0.85));
