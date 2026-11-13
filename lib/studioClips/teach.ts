// How SOCIA edits, taught by Noah's review of a hand cut (2026-11-06). The cut
// he approved: open on the one unbroken move, short hits of the repeated action
// through soft dissolves, a clean look at the finished thing, the logo, and the
// place and the ask in big type in the middle of the frame. The real sound of
// the action up front with steady music under it. These rules are the parts
// code can hold; the model's rules live in lib/studioClips/analysis.ts. Pure.
import { joinedPunches } from "./punch";
import { cutSpeaks } from "../music/taste";
import { timeline } from "./timeline";
import type { ClipCard, Edl, EndCard } from "./types";

export const END_CARD_SEC = 1.7;
/** The last shot plays clean first, so the logo is seen before the frame softens. */
export const ENDING_MIN_SEC = END_CARD_SEC + 0.9;
/** Everything but the action's own sound sits this low: the action filter lifts a whole clip (lib/studioClips/cleanSound.ts). */
export const QUIET_ROOM_VOLUME = 0.08;

const LIMITS = { location: 40, cta: 24, site: 40 };
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").replace(/—/g, ",").trim().slice(0, n).trim() : "");

/** A website as people read it: "salvopizza.com", from whatever was typed in the brand settings. "" when it isn't one. */
export function siteName(url: string | null | undefined): string {
  const host = clip(url, 200).replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/?#]/)[0].toLowerCase();
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : "";
}

/** An ending card, bounded; null when it has nothing to say. */
export function cleanEndCard(v: unknown): EndCard | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const card = { location: clip(o.location, LIMITS.location), cta: clip(o.cta, LIMITS.cta), site: clip(o.site, LIMITS.site) };
  return card.location || card.cta || card.site ? card : null;
}

/** The size of one line of the ending card so it fits the frame: its own size, or smaller for longer words. */
export function endLineSize(text: string, base: number, frameWidth: number): number {
  // Anton's capitals average under half their height wide; 0.46 keeps a margin.
  const fit = (frameWidth * 0.82) / Math.max(1, Array.from(text).length * 0.46);
  return Math.round(Math.min(base * (frameWidth / 1080), fit));
}

/** Frames SOCIA shows the editing model: every clip gets at least one, the rest shared evenly, spread across each clip. */
export function editFrames<T extends { t: number }>(clips: { id: string; frames: T[] }[], budget = 24): { clipId: string; frames: T[] }[] {
  const withFrames = clips.filter((c) => c.frames.length);
  const each = Math.max(1, Math.floor(budget / Math.max(1, withFrames.length)));
  return withFrames.map((c) => {
    if (c.frames.length <= each) return { clipId: c.id, frames: c.frames };
    const step = c.frames.length / each;
    return { clipId: c.id, frames: Array.from({ length: each }, (_, i) => c.frames[Math.floor(i * step + step / 2)]) };
  });
}

/**
 * Shots of the same clip closer than this in the footage are one shot. Noah,
 * 2026-11-10: a 25 s single take came back as nine pieces skipping 0.1 to 0.5 s
 * each, every skip under a dissolve: the picture jumped and doubled at every
 * join ("the cuts, the transitions aren't smooth at all").
 */
export const CONTINUOUS_GAP_SEC = 0.75;

/** Neighbouring shots that are really one stretch of the same clip, joined back into one: no skip, no dissolve, no change of sound in the middle of it. */
export function joinContinuous<S extends { clipId: string; in: number; out: number; punches?: number[]; sound?: boolean; volume?: number; transition?: Edl["segments"][number]["transition"]; role?: string; note?: string }>(segments: S[], keepApart?: (prev: S, s: S) => boolean): S[] {
  const out: S[] = [];
  for (const s of segments) {
    const prev = out[out.length - 1];
    const gap = prev ? s.in - prev.out : Infinity;
    // Same clip, and either a skip too small to read as a new shot or the footage running backwards.
    // A deliberate jump cut in someone's speech (a pause or a mistake taken out) stays apart.
    if (prev && prev.clipId === s.clipId && gap < CONTINUOUS_GAP_SEC && s.out > prev.in && !(gap > 0 && keepApart?.(prev, s))) {
      const sound = Boolean(prev.sound || s.sound);
      const merged = { ...prev, out: Math.max(prev.out, s.out), role: s.role === "ending" ? "ending" : prev.role } as S;
      // Where it would have cut stays as a punch-in, so the take keeps its rhythm (lib/studioClips/punch.ts).
      const punches = joinedPunches(prev, s, prev.out);
      if (punches.length) merged.punches = punches; else delete merged.punches;
      if (sound) { merged.sound = true; delete merged.volume; }
      out[out.length - 1] = merged;
      continue;
    }
    out.push(s);
  }
  return out;
}

type Brand = { location: string | null; website: string | null | undefined };

/**
 * What the model chose, held to what's true and what works on screen:
 *  - the card's site comes from the brand settings, never the model; a place is
 *    used only when the brand has one, so nothing is invented;
 *  - with a card, no line of on-screen text repeats the ask or runs into it;
 *  - the last shot is long enough for the logo and then the card;
 *  - the action's sound goes up front only when no one is talking.
 */
export function teachEdit(edl: Edl, brand: Brand, clips: { id: string; durationSec: number; words: { startMs: number }[] | null }[], raw: { location?: unknown; cta?: unknown } | null | undefined): Edl {
  const out: Edl = { ...edl, segments: joinContinuous(edl.segments.map((s) => ({ ...s }))), text: edl.text.map((t) => ({ ...t })) };
  out.segments.forEach((s, i) => { s.id = `s${i + 1}`; if (i === 0) delete s.transition; });
  const card = cleanEndCard({ location: brand.location ? raw?.location : "", cta: raw?.cta, site: siteName(brand.website) });
  // The place and the ask are what the card is for; a website alone isn't an ending.
  const shown = card && (card.location || card.cta) ? card : null;
  delete out.endCard;
  const last = out.segments[out.segments.length - 1];
  if (shown && last) {
    out.endCard = shown;
    const src = clips.find((c) => c.id === last.clipId);
    if (src && last.out - last.in < ENDING_MIN_SEC) {
      // Start the last shot earlier rather than run it past where it was chosen to end: that end was
      // picked before a hand or a tool crossed the subject (Noah, 2026-11-12, the wheel over the slices).
      const prev = out.segments[out.segments.length - 2];
      const floor = prev && prev.clipId === last.clipId ? prev.out : 0;
      const need = ENDING_MIN_SEC - (last.out - last.in);
      last.in = Math.round(Math.max(floor, last.in - need) * 100) / 100;
      if (last.out - last.in < ENDING_MIN_SEC) {
        const room = src.durationSec - last.in;
        last.out = Math.round(Math.min(src.durationSec, last.in + Math.min(room, ENDING_MIN_SEC)) * 100) / 100;
      }
    }
    out.text = out.text.filter((t) => t.role !== "cta");
    const cardAt = timeline(out).durationSec - END_CARD_SEC;
    out.text = out.text.filter((t) => t.at < cardAt - 0.5).map((t) => ({ ...t, end: Math.min(t.end, Math.round(cardAt * 100) / 100) }));
  }
  const speaks = cutSpeaks(out.segments, Object.fromEntries(clips.map((c) => [c.id, c.words])));
  if (speaks || !out.segments.some((s) => s.sound)) {
    delete out.actionSound;
    out.segments.forEach((s) => { delete s.sound; });
  } else {
    out.actionSound = true;
    out.segments.forEach((s) => { if (!s.sound) s.volume = QUIET_ROOM_VOLUME; });
  }
  return out;
}

/** Card detail: 2 = moments picked from dense frames. A card older than this isn't reused for new uploads. */
export const CARD_DETAIL = 2;
export const cardIsCurrent = (c: Pick<ClipCard, "detail"> | null | undefined): boolean => (c?.detail ?? 1) >= CARD_DETAIL;
