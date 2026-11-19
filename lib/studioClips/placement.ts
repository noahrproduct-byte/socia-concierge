// Where the graphics, the lines and the captions sit so they stay off the
// person's face. The cut is looked at where each of them shows
// (lib/studioClips/lookAtCut.ts finds the person in those frames, in the
// browser), and each one is given the place in the frame that clears the
// head: a card at the top, a little lower, or under the middle; a line in the
// top, middle or bottom slot; the captions lower when they would cross the
// face. Where no one is found, nothing is moved. Pure.
import { timeline, FPS } from "./timeline";
import { sceneSpans, type ScenePlace, type EdlScene } from "./scenes";
import { DEFAULT_STYLE } from "./style";
import type { Edl, TranscriptWord } from "./types";

/** A band of the frame, top to bottom, as shares of its height (0 = top edge, 1 = bottom edge). */
export type Band = { top: number; bottom: number };
/** One look at the cut: the output second it was taken at, and where the person's head is (null: no one found). */
export type Look = { sec: number; head: Band | null };
export type Sample = { sec: number; clipId: string; clipSec: number };

const CARD: Record<ScenePlace, Band> = { top: { top: 0.12, bottom: 0.4 }, upper: { top: 0.27, bottom: 0.55 }, lower: { top: 0.5, bottom: 0.78 } };
const SLOT: Record<"top" | "middle" | "bottom", Band> = { top: { top: 0.1, bottom: 0.24 }, middle: { top: 0.42, bottom: 0.58 }, bottom: { top: 0.68, bottom: 0.82 } };
const CAPTION: Record<string, Band> = { top: { top: 0.1, bottom: 0.24 }, middle: { top: 0.43, bottom: 0.57 }, lower: { top: 0.62, bottom: 0.74 }, bottom: { top: 0.74, bottom: 0.86 } };
const NEAR_SEC = 2.5;
export const MAX_SAMPLES = 14;

const overlap = (a: Band, b: Band) => Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

/** The head of a person whose body fills `body`: about the top third of them, never less than a tenth of the frame. */
export function headOf(body: Band): Band {
  const h = Math.max(0.1, (body.bottom - body.top) * 0.34);
  return { top: Math.max(0, body.top - 0.01), bottom: Math.min(1, body.top + h) };
}

/** The first of `order` that clears the head; if none does, the one that covers least of it. */
export function clearest<K extends string>(bands: Record<K, Band>, order: K[], head: Band): K {
  let best = order[0], least = Infinity;
  for (const k of order) {
    const o = overlap(bands[k], head);
    if (o <= 0.005) return k;
    if (o < least) { least = o; best = k; }
  }
  return best;
}

/** The frames worth looking at: where each scene and each line shows, and the middle of each shot. */
export function samplesFor(edl: Edl, words: Record<string, TranscriptWord[] | null | undefined>): Sample[] {
  const tl = timeline(edl);
  const want: number[] = [];
  for (const sp of sceneSpans(edl, words)) want.push(sp.from / FPS + 0.5);
  for (const t of edl.text) if (t.text.trim()) want.push(t.at + 0.3);
  for (const s of tl.segments.slice(0, 6)) want.push(s.startSec + (s.durationFrames / FPS) / 2);
  const out: Sample[] = [];
  for (const sec of want) {
    if (out.length >= MAX_SAMPLES || out.some((o) => Math.abs(o.sec - sec) < 0.4)) continue;
    const s = tl.segments.find((x) => sec >= x.startSec && sec < x.startSec + x.durationFrames / FPS);
    if (s) out.push({ sec: Math.round(sec * 100) / 100, clipId: s.clipId, clipSec: Math.round((s.in + (sec - s.startSec) * (s.motion?.speed?.rate ?? 1)) * 100) / 100 });
  }
  return out;
}

const headAt = (looks: Look[], sec: number): Band | null => {
  let best: Look | null = null;
  for (const l of looks) if (Math.abs(l.sec - sec) <= NEAR_SEC && (!best || Math.abs(l.sec - sec) < Math.abs(best.sec - sec))) best = l;
  return best?.head ?? null;
};

/** The cut with everything moved clear of the face, and how many things were moved. */
export function placeClear(edl: Edl, looks: Look[], words: Record<string, TranscriptWord[] | null | undefined>): { edl: Edl; moved: { scenes: number; lines: number; captions: boolean } } {
  const moved = { scenes: 0, lines: 0, captions: false };
  if (!looks.some((l) => l.head)) return { edl, moved };
  let out = edl;
  // A split screen keeps the face in the window under the field: the middle of the heads seen, a little below centre so the shoulders show.
  if (edl.scenesSplit && edl.scenes?.length) {
    const mids = looks.flatMap((l) => (l.head ? [(l.head.top + l.head.bottom) / 2] : [])).sort((a, b) => a - b);
    out = { ...out, scenesFocus: Math.round(Math.min(0.85, Math.max(0.15, mids[Math.floor(mids.length / 2)] + 0.04)) * 100) / 100 };
  }
  // Cards: not as a split screen (the picture moves out of the way) and not behind the person (they stay in front).
  if (edl.scenes?.length && !edl.scenesSplit && !edl.scenesBehind) {
    const spans = sceneSpans(edl, words);
    const low = (edl.style ?? DEFAULT_STYLE).captions.position === "top";
    const scenes: EdlScene[] = edl.scenes.map((sc) => {
      const sp = spans.find((x) => x.scene.id === sc.id);
      const head = sp ? headAt(looks, sp.from / FPS + 0.5) : null;
      if (!head) return sc;
      const place = clearest(CARD, low ? ["upper", "lower", "top"] : ["top", "upper", "lower"], head);
      if (place !== (sc.place ?? (low ? "upper" : "top"))) moved.scenes += 1;
      return { ...sc, place };
    });
    out = { ...out, scenes };
  }
  // Lines on the video: the slot that clears the head while the line is up.
  const text = out.text.map((t) => {
    const head = t.text.trim() ? headAt(looks, t.at + 0.3) : null;
    const slot = (t as { slot?: string }).slot;
    if (!head || (slot !== "top" && slot !== "middle" && slot !== "bottom")) return t;
    const next = clearest(SLOT, [slot, ...(["top", "bottom", "middle"] as const).filter((s) => s !== slot)], head);
    if (next === slot) return t;
    moved.lines += 1;
    return { ...t, slot: next };
  });
  if (moved.lines) out = { ...out, text };
  // Captions: one place for the whole video, so they move only when they would cross the face in most of what was seen.
  const style = out.style ?? DEFAULT_STYLE;
  const band = CAPTION[style.captions.position];
  const heads = looks.flatMap((l) => (l.head ? [l.head] : []));
  if (band && heads.filter((h) => overlap(band, h) > 0.02).length > heads.length / 2) {
    const next = (["lower", "bottom"] as const).find((p) => heads.filter((h) => overlap(CAPTION[p], h) > 0.02).length <= heads.length / 4) ?? "bottom";
    if (next !== style.captions.position) { out = { ...out, style: { ...style, captions: { ...style.captions, position: next } } }; moved.captions = true; }
  }
  return { edl: out, moved };
}

/** What was moved, in a sentence for the result screen; null when nothing was. */
export function placeNote(moved: { scenes: number; lines: number; captions: boolean }): string | null {
  const parts = [moved.scenes ? `${moved.scenes} graphic${moved.scenes === 1 ? "" : "s"}` : "", moved.lines ? `${moved.lines} line${moved.lines === 1 ? "" : "s"}` : "", moved.captions ? "the captions" : ""].filter(Boolean);
  return parts.length ? `SOCIA looked at the video and moved ${parts.join(", ").replace(/, ([^,]*)$/, " and $1")} clear of the person's face.` : null;
}
