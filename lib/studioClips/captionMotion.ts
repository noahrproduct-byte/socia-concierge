// Caption motion presets (Nov 2026): ten treatments built from the owner's
// reference boards (Vox, Iman Gadzhi, Johnny Harris, Ali Abdaal, MrBeast,
// Sam Kolder, Casey Neistat, Daniel Schiffer, Lyrical Lemonade, Wes
// Anderson). Each one has an entrance, an emphasis on the key word and an
// exit; the pictures are drawn in components/studio/remotion/CaptionMotion.tsx
// from the frame alone, so scrubbing, the Player and the export agree.
//
// What the boards show is written on each preset (`observed`); every timing
// here is a value chosen for SOCIA, not measured from the references.
// Pure, unit-tested.
import type { CaptionStyleId, FontId, TextBox } from "./style";
import type { TransitionKind } from "./types";

/** The phases of a motion caption, in frames at 30 fps, before fitting to the page. */
export type MotionTiming = {
  /** the entrance */
  in: number;
  /** the emphasis, from the key word's beat */
  emphasis: number;
  /** the exit */
  out: number;
  /** the shortest still, readable hold the fitting keeps between the entrance and the exit */
  hold: number;
};

export type CaptionMotion = {
  id: CaptionStyleId;
  /** the name in the picker */
  label: string;
  /** who the technique is from */
  reference: string;
  /** what the board shows, in order: in, emphasis, out */
  observed: string;
  timing: MotionTiming;
  /** the clip join that matches the treatment; chosen by the person in the This cut tool, never set by the caption style */
  transition: TransitionKind | null;
  /** the preset lands on music beats when the cut has a measured track (Beat Cutout) */
  beats?: true;
  /** the preset has a point on the picture the person places (Product Callout) */
  anchor?: true;
  /** the preset covers the picture (a title card) */
  card?: true;
};

/** Timings chosen for SOCIA (not measured from the references): most entrances and exits are a quarter second, the hold at least a third. */
const T = (a: number, e: number, o: number, hold = 10): MotionTiming => ({ in: a, emphasis: e, out: o, hold });

export const CAPTION_MOTIONS: readonly CaptionMotion[] = [
  { id: "editorial", label: "Editorial Highlight", reference: "Vox", observed: "The caption stays put while a yellow marker wipes in behind it; an underline sweeps right under the key word; the paper tears away.", timing: T(8, 7, 7), transition: "tear" },
  { id: "serif", label: "Cinematic Serif", reference: "Iman Gadzhi", observed: "A thin white serif fades in; the key word becomes a giant italic and pushes forward; the letters blur out.", timing: T(9, 8, 9, 12), transition: "fade" },
  { id: "annotation", label: "Documentary Annotation", reference: "Johnny Harris", observed: "A typewriter label lands on a paper strip over a map grid; a red hand-drawn circle goes round the key word; a push into the map carries the label out.", timing: T(10, 9, 7), transition: "pushin" },
  { id: "callout", label: "Clean Callout", reference: "Ali Abdaal", observed: "A rounded cream card slides up; a mint pill grows behind the active word without moving the sentence; the card slides down.", timing: T(8, 6, 7), transition: "fade" },
  { id: "punch", label: "Punch Captions", reference: "MrBeast", observed: "Heavy outlined capitals pop in a few words at a time; the stressed word jumps forward, oversized and yellow, and settles; a hard cut to the next words.", timing: T(5, 6, 0, 6), transition: "cut" },
  { id: "title", label: "Cinematic Title", reference: "Sam Kolder", observed: "Widely spaced thin capitals fade up; the letter spacing keeps opening across the page; the title dissolves into light.", timing: T(12, 10, 10, 12), transition: "motionblur" },
  { id: "tape", label: "Handwritten Tape", reference: "Casey Neistat", observed: "Marker lettering is written across a strip of masking tape; a rough red underline doubles back under the key word; the tape peels away from a corner.", timing: T(11, 8, 8), transition: "slide" },
  { id: "product", label: "Product Callout", reference: "Daniel Schiffer", observed: "A fine leader line draws out from a point on the product to a small boxed label; the label locks to the object; the line retracts.", timing: T(9, 6, 7), transition: null, anchor: true },
  { id: "cutout", label: "Beat Cutout", reference: "Lyrical Lemonade", observed: "Cut-paper letters slam in; an acid-green duplicate jitters off the word on the snare; the letters scatter like stickers.", timing: T(8, 5, 8), transition: "flash", beats: true },
  { id: "titlecard", label: "Symmetrical Title Card", reference: "Wes Anderson", observed: "A hard cut to a centred serif on a flat mustard card; two fine rules extend evenly from either side; a hard cut away.", timing: T(1, 10, 1, 12), transition: "cut", card: true },
];

export const CAPTION_MOTION_IDS = CAPTION_MOTIONS.map((m) => m.id);
export const captionMotion = (id: string): CaptionMotion | undefined => CAPTION_MOTIONS.find((m) => m.id === id);
export const isCaptionMotion = (id: string): boolean => CAPTION_MOTIONS.some((m) => m.id === id);

/** What a motion preset sets when it is picked: its face, its box and where it sits (the person changes any of it after). */
export const CAPTION_MOTION_DEFAULTS: Record<string, { font: FontId; textBox: TextBox; highlight: string; captions: { position: "top" | "middle" | "lower" | "bottom"; size: "s" | "m" | "l"; box: boolean; uppercase: boolean } }> = {
  editorial: { font: "montserrat", textBox: "none", highlight: "#ffe600", captions: { position: "lower", size: "l", box: false, uppercase: true } },
  serif: { font: "playfair", textBox: "none", highlight: "#ffffff", captions: { position: "middle", size: "m", box: false, uppercase: true } },
  annotation: { font: "spacemono", textBox: "none", highlight: "#e0312b", captions: { position: "lower", size: "m", box: false, uppercase: true } },
  callout: { font: "nunito", textBox: "none", highlight: "#9fe8c7", captions: { position: "lower", size: "m", box: false, uppercase: false } },
  punch: { font: "anton", textBox: "outline", highlight: "#ffe600", captions: { position: "middle", size: "l", box: false, uppercase: true } },
  title: { font: "montserrat", textBox: "none", highlight: "#ffffff", captions: { position: "middle", size: "m", box: false, uppercase: true } },
  tape: { font: "kaushan", textBox: "none", highlight: "#d2322d", captions: { position: "lower", size: "l", box: false, uppercase: false } },
  product: { font: "instrument", textBox: "none", highlight: "#ffffff", captions: { position: "top", size: "s", box: false, uppercase: true } },
  cutout: { font: "anton", textBox: "none", highlight: "#b858e6", captions: { position: "middle", size: "l", box: false, uppercase: true } },
  titlecard: { font: "playfair", textBox: "none", highlight: "#d9a21b", captions: { position: "middle", size: "l", box: false, uppercase: true } },
};

/**
 * The entrance and exit fitted to a page: a short caption keeps a readable
 * hold, so the two are scaled down together when the page is too short for
 * them, never below two frames each. The emphasis window is cut to what is
 * left after the entrance.
 */
export function fitPhases(durationInFrames: number, t: MotionTiming): { in: number; out: number; emphasis: number } {
  const d = Math.max(1, Math.round(durationInFrames));
  const room = Math.max(0, d - t.hold);
  const want = t.in + t.out;
  const k = want > 0 && want > room ? room / want : 1;
  const fin = Math.max(t.in > 0 ? Math.min(2, t.in) : 0, Math.round(t.in * k));
  const fout = Math.max(t.out > 0 ? Math.min(2, t.out) : 0, Math.round(t.out * k));
  const emphasis = Math.max(2, Math.min(t.emphasis, d - fin - fout));
  return { in: fin, out: fout, emphasis };
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}'$%]/gu, "");
/** Words that never carry a line, so the key word of a caption is the last word that is not one of these. */
const SMALL = new Set(["the", "a", "an", "and", "or", "but", "so", "to", "of", "in", "on", "at", "for", "with", "by", "from", "is", "are", "was", "were", "be", "been", "it", "its", "it's", "this", "that", "these", "those", "i", "you", "we", "they", "he", "she", "me", "my", "your", "our", "us", "them", "his", "her", "if", "as", "than", "then", "just", "very", "really", "here", "there", "do", "does", "did", "have", "has", "had", "can", "could", "would", "should", "will", "not", "no", "yes", "up", "out", "how", "what", "huh", "um", "uh", "like"]);

/**
 * The emphasised word of a page: the person's own pick for this caption
 * (null = none), else the cut's highlighted words, else the last word that
 * carries the line. -1 when nothing is emphasised.
 */
export function emphasisWord(tokens: string[], pick: string | null | undefined, highlighted: string[] | undefined): number {
  const clean = tokens.map(norm);
  if (pick === null) return -1;
  if (pick) { const i = clean.indexOf(norm(pick)); if (i >= 0) return i; }
  if (highlighted?.length) { const i = clean.findIndex((t) => t && highlighted.includes(t)); if (i >= 0) return i; }
  for (let i = clean.length - 1; i >= 0; i--) if (clean[i].length >= 3 && !SMALL.has(clean[i])) return i;
  return clean.length ? clean.length - 1 : -1;
}

/** A page with one token, or every token at the same time, has phrase timing only: the emphasis beat cannot come from a word. */
export function isPhraseLevel(tokens: { fromMs: number; toMs: number }[]): boolean {
  if (tokens.length <= 1) return true;
  return tokens.every((t) => t.fromMs === tokens[0].fromMs && t.toMs === tokens[0].toMs);
}

/** With phrase timing and no beat set by the person, the emphasis lands this far into the page. */
export const PHRASE_BEAT = 0.4;

/**
 * The frame (from the page's start) the emphasis lands on: the beat the
 * person set, else the key word's own start, else a point into the page
 * with phrase timing. Always after the entrance and before the exit when
 * the page leaves room for that.
 */
export function emphasisFrame(a: { tokens: { fromMs: number; toMs: number }[]; startMs: number; keyWord: number; beatMs?: number | null; durationInFrames: number; fps: number; phases: { in: number; out: number; emphasis: number } }): number {
  const { tokens, startMs, keyWord, beatMs, durationInFrames: d, fps, phases } = a;
  let f: number;
  if (typeof beatMs === "number" && Number.isFinite(beatMs)) f = Math.round((beatMs / 1000) * fps);
  else if (keyWord >= 0 && tokens[keyWord] && !isPhraseLevel(tokens)) f = Math.round(((tokens[keyWord].fromMs - startMs) / 1000) * fps);
  else f = Math.round(d * PHRASE_BEAT);
  const lo = phases.in, hi = Math.max(lo, d - phases.out - phases.emphasis);
  return Math.min(hi, Math.max(lo, f));
}

/** The nearest beat at or before `ms` on a measured track, in output ms; `ms` itself without a track. */
export function beatBefore(ms: number, beat: { bpm: number; offsetSec: number } | null | undefined): number {
  if (!beat || !(beat.bpm > 0)) return ms;
  const period = 60000 / beat.bpm, first = beat.offsetSec * 1000;
  if (ms < first) return ms;
  return first + Math.floor((ms - first) / period) * period;
}

/** A repeatable 0..1 number from a seed (letters scatter the same way in every frame and every render). */
export function hash01(seed: number): number {
  let x = (seed * 374761393 + 668265263) | 0;
  x = ((x ^ (x >>> 13)) * 1274126177) | 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

// ---- torn paper edges, as CSS clip-path polygons (drawn by the caption and segment layers) ----

/** The torn edge of a strip of paper or tape: a jagged polygon along the side named, as percentages of the box. */
export function tornEdge(seed: number, side: "left" | "right" | "top", teeth = 9, depth = 3): string {
  const pts: string[] = [];
  for (let i = 0; i <= teeth; i++) {
    const along = (i / teeth) * 100;
    const d = (hash01(seed * 31 + i) - 0.5) * 2 * depth;
    if (side === "left") pts.push(`${(depth + d).toFixed(2)}% ${along.toFixed(2)}%`);
    else if (side === "right") pts.push(`${(100 - depth + d).toFixed(2)}% ${(100 - along).toFixed(2)}%`);
    else pts.push(`${along.toFixed(2)}% ${(depth + d).toFixed(2)}%`);
  }
  return pts.join(", ");
}

/** A strip with torn short ends: a polygon that runs round the box with jagged left and right sides. */
export function tornStrip(seed: number, depth = 2.5): string {
  const teeth = 7;
  const left: string[] = [], right: string[] = [];
  for (let i = 0; i <= teeth; i++) {
    const y = (i / teeth) * 100;
    left.push(`${(depth + (hash01(seed * 7 + i) - 0.5) * 2 * depth).toFixed(2)}% ${y.toFixed(2)}%`);
    right.push(`${(100 - depth + (hash01(seed * 11 + i) - 0.5) * 2 * depth).toFixed(2)}% ${(100 - y).toFixed(2)}%`);
  }
  return `polygon(${[...left, ...right].join(", ")})`;
}

/** The torn-paper edge of a tear transition at `wipe` 0..1 across the frame: everything left of the edge is the incoming shot. */
export function tearClip(wipe: number, seed = 3): string {
  if (wipe <= 0) return "polygon(0 0, 0 0, 0 0)";
  if (wipe >= 1) return "none";
  const x = wipe * 112 - 6;
  const teeth = 14;
  const edge: string[] = [];
  for (let i = 0; i <= teeth; i++) {
    const y = (i / teeth) * 100;
    edge.push(`${(x + (hash01(seed * 13 + i) - 0.5) * 7).toFixed(2)}% ${y.toFixed(2)}%`);
  }
  return `polygon(0 0, ${edge[0].split(" ")[0]} 0%, ${edge.join(", ")}, 0 100%)`;
}

/** The person's changes to one caption (a page of words), kept with the cut by the caption's key. */
export type CaptionOverride = {
  /** a caption style for this caption alone; absent = the track's */
  preset?: CaptionStyleId;
  /** the word emphasised (as said, matched loosely), null = none; absent = SOCIA's pick */
  emphasis?: string | null;
  /** the emphasis beat, ms from the caption's start; absent = the key word's own time */
  beatMs?: number;
  /** where a callout's leader line starts on the picture, 0..1 each way */
  anchor?: { x: number; y: number };
};

/** The key of a caption: the clip and the time in it of the first word, so it survives trims and moves. */
export const captionKey = (clipId: string, clipMs: number): string => `${clipId}@${Math.round(clipMs)}`;

const KEY = /^[\w-]{1,64}@\d{1,9}$/;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Overrides from anywhere (the browser, stored JSON), bounded; undefined when there are none. */
export function sanitizeCaptionOverrides(v: unknown, isPreset: (id: unknown) => id is CaptionStyleId): Record<string, CaptionOverride> | undefined {
  if (!v || typeof v !== "object") return undefined;
  const out: Record<string, CaptionOverride> = {};
  for (const [key, raw] of Object.entries(v as Record<string, unknown>).slice(0, 400)) {
    if (!KEY.test(key) || !raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const next: CaptionOverride = {};
    if (isPreset(o.preset)) next.preset = o.preset;
    if (o.emphasis === null) next.emphasis = null;
    else if (typeof o.emphasis === "string" && o.emphasis.trim()) next.emphasis = o.emphasis.trim().slice(0, 40);
    if (typeof o.beatMs === "number" && Number.isFinite(o.beatMs)) next.beatMs = Math.round(Math.min(60000, Math.max(0, o.beatMs)));
    const an = o.anchor as Record<string, unknown> | undefined;
    if (an && typeof an.x === "number" && typeof an.y === "number" && Number.isFinite(an.x) && Number.isFinite(an.y)) next.anchor = { x: Math.round(clamp01(an.x) * 1000) / 1000, y: Math.round(clamp01(an.y) * 1000) / 1000 };
    if (Object.keys(next).length) out[key] = next;
  }
  return Object.keys(out).length ? out : undefined;
}

/** The phrase every preset is previewed with in the picker, timed like three spoken words. */
export const DEMO_PHRASE = { text: "Find your focus", startMs: 0, tokens: [{ text: " Find", fromMs: 0, toMs: 320 }, { text: " your", fromMs: 320, toMs: 560 }, { text: " focus", fromMs: 560, toMs: 1100 }] };
/** A preview plays this long (frames at 30 fps): the phrase, its hold and its exit. */
export const DEMO_FRAMES = 54;
