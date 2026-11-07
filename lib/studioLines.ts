// What "Use this hook" and "Use this ending" do (Noah, 2026-11-06: "If you
// click it, nothing happens"). On a video the line goes on the picture, where
// the person can see it: the opening over the first seconds, the ending over
// the last. On a still post, which has no timeline, it goes in the caption.
// Used again, it comes off. Pure and browser-safe.

import type { EdlText } from "./studioClips/types";
import { presetForFix } from "./studioFixes";
import { MAX_TEXT_LAYERS } from "./textPresets";

export const LINE_IDS = { hook: "line-hook", cta: "line-cta" } as const;
/** How long a used line stays on the picture, at most. */
export const LINE_SEC = 3;

export type LineField = keyof typeof LINE_IDS;
type State = { hook: string; cta: string; caption: string; layers: EdlText[] };

/** Where the line sits: an opening from 0, an ending up to the last frame. */
export function lineLayer(field: LineField, text: string, durationSec: number): EdlText {
  const len = Math.min(LINE_SEC, durationSec);
  const at = field === "hook" ? 0 : Math.max(0, durationSec - len);
  const end = at + len;
  return { id: LINE_IDS[field], at, end, text, role: field === "hook" ? "opening" : "cta", presetId: presetForFix(field === "hook" ? "opening" : "ending", text) };
}

const dropFromCaption = (caption: string, line: string): string => {
  if (!line.trim()) return caption;
  const c = caption.trim();
  if (c === line.trim()) return "";
  if (c.startsWith(`${line.trim()}\n\n`)) return c.slice(line.trim().length).trim();
  if (c.endsWith(`\n\n${line.trim()}`)) return c.slice(0, -line.trim().length).trim();
  return caption;
};

/**
 * Whether the person put this line to use. The page fills in the hook and ending
 * it detected in the draft, so a matching field alone proves nothing: on a video
 * the line must be on the picture, on a still post in the caption.
 */
export function lineInUse(cur: Pick<State, "hook" | "cta" | "caption" | "layers">, field: LineField, text: string, video: boolean): boolean {
  if (cur[field] !== text) return false;
  return video ? cur.layers.some((l) => l.id === LINE_IDS[field] && l.text === text) : cur.caption.includes(text);
}

/**
 * The working state once this line is used, or taken off when it was already
 * in use. `at` is where the player should jump to show it; null when there is
 * nothing to show (a still post, or the line came off).
 */
export function applyLine<S extends State>(cur: S, field: LineField, text: string, o: { video: boolean; durationSec: number }): { next: S; used: boolean; at: number | null } {
  const was = cur[field];
  const used = !lineInUse(cur, field, text, o.video && o.durationSec > 0);
  const id = LINE_IDS[field];
  const others = cur.layers.filter((l) => l.id !== id);
  if (o.video && o.durationSec > 0) {
    if (!used) return { next: { ...cur, [field]: "", layers: others }, used, at: null };
    const layer = lineLayer(field, text, o.durationSec);
    // Whatever else was proposed for those same seconds gives way to the line the person chose.
    const clear = others.filter((l) => l.end <= layer.at || l.at >= layer.end);
    return { next: { ...cur, [field]: text, layers: [...clear, layer].slice(-MAX_TEXT_LAYERS) }, used, at: layer.at };
  }
  const base = dropFromCaption(cur.caption, was);
  if (!used) return { next: { ...cur, [field]: "", caption: base }, used, at: null };
  const caption = field === "hook" ? [text, base.trim()].filter(Boolean).join("\n\n") : [base.trim(), text].filter(Boolean).join("\n\n");
  return { next: { ...cur, [field]: text, caption }, used, at: null };
}

/** The lines proposed by the Improve walkthrough, around the ones the person chose: those stay, and win their seconds. */
export function mergeProposed(current: EdlText[], proposed: EdlText[], chosenText: string[]): EdlText[] {
  const ids: string[] = Object.values(LINE_IDS);
  const kept = current.filter((l) => ids.includes(l.id) || chosenText.includes(l.text));
  const rest = proposed.filter((p) => !kept.some((k) => p.at < k.end && p.end > k.at));
  return [...kept, ...rest].slice(0, MAX_TEXT_LAYERS);
}
