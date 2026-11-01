// On-screen text SOCIA puts on a video by itself (Rate → "Put the text on
// the video"). Two rules make it not look machine-made:
//  - the words read like a person typed them in the Instagram or TikTok text
//    tool: short, sentence case, no stacked emojis or hashtags, no dashes or
//    marketing phrases; a line that can't be made to read that way is dropped,
//    never shown;
//  - the look is the plain one people use: a clean sans, white on a dark box
//    (or dark on a white box over dark footage), the size from the length of
//    the line, nothing glowing or gradient. A brand's own saved look wins.
// Pure.
import type { EdlText } from "./types";
import { DEFAULT_STYLE, type EdlStyle } from "./style";

export const MAX_OVERLAY_CHARS = 60;
export const MAX_OVERLAYS = 4;

/** Phrases that read as written by a model or an ad, not a person. */
const AI_TELLS = /\b(unlock|unleash|elevate|game[- ]?chang|level up|next level|secret sauce|you won'?t believe|ultimate|delve|embark|journey|dive in|deep dive|in today'?s|look no further|transform your|must[- ]see|mind[- ]?blow|hidden gem|elevated|curated|seamless|indulge|tantaliz|mouth[- ]?watering|taste buds|irresistible)/i;
const EMOJI = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*/gu;

/** Sentence case; in a Title Case line, short all-caps words (acronyms like BBQ) stay. */
const sentenceCase = (s: string, keepAcronyms: boolean) => {
  const words = s.split(/\s+/);
  return words.map((w, i) => {
    if (keepAcronyms && /^[A-Z0-9&]{2,4}$/.test(w) && /[A-Z]/.test(w)) return w;
    if (w === "I" || /^I'/.test(w)) return w;
    const low = w.toLowerCase();
    return i === 0 ? low.charAt(0).toUpperCase() + low.slice(1) : low;
  }).join(" ");
};

/** A line as a person would type it on a video, or null when it can't read that way. */
export function humanText(raw: string): string | null {
  let t = (raw ?? "").replace(/\s+/g, " ").trim();
  t = t.replace(/\s*#[\p{L}\p{N}_]+/gu, "").trim();
  t = t.replace(/\s*[—–]\s*/g, ", ").replace(/,\s*,/g, ",").replace(/^,\s*|,\s*$/g, "");
  t = t.replace(/!{2,}/g, "!").replace(/\?{2,}/g, "?").replace(/\s+([!?.,])/g, "$1");
  // One emoji at most, at the end (where people put it).
  const emojis = t.match(EMOJI) ?? [];
  t = t.replace(EMOJI, "").replace(/\s+/g, " ").trim();
  t = t.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
  if (!t || AI_TELLS.test(t)) return null;
  const words = t.split(" ");
  const letters = t.replace(/[^\p{L}]/gu, "");
  const titleCase = words.length >= 3 && words.filter((w) => /^\p{Lu}\p{Ll}/u.test(w)).length >= Math.ceil(words.length * 0.75);
  const shouting = words.length > 3 && letters.length > 0 && letters === letters.toUpperCase();
  if (shouting) t = sentenceCase(t, false);
  else if (titleCase) t = sentenceCase(t, true);
  // An overlay doesn't end in a full stop.
  t = t.replace(/(?<!\.)\.$/, "");
  if (emojis.length) t = `${t} ${emojis[0]}`;
  if ([...t].length > MAX_OVERLAY_CHARS) return null;
  return t;
}

/** Bigger for a few words, smaller for a full line. */
export const sizeFor = (text: string): NonNullable<EdlText["size"]> => {
  const n = [...text].length;
  return n <= 16 ? "l" : n <= 32 ? "m" : "s";
};

export type OverlayLine = { text: string; t?: number | null; role?: EdlText["role"] | null };

/**
 * Where each line goes: the first opens the video, the last one closes it
 * (as its ask when it was written as one), any between sit where SOCIA saw
 * the moment, or evenly. Nothing overlaps and nothing runs past the end.
 */
export function placeOverlays(lines: OverlayLine[], durationSec: number): EdlText[] {
  const seen = new Set<string>();
  const clean = lines.flatMap((l) => {
    const text = humanText(l.text);
    if (!text || seen.has(text.toLowerCase())) return [];
    seen.add(text.toLowerCase());
    return [{ text, t: typeof l.t === "number" && Number.isFinite(l.t) ? l.t : null, role: l.role ?? null }];
  });
  if (!clean.length || !(durationSec > 0.8)) return [];
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const end = durationSec - 0.2;
  if (durationSec < 4 || clean.length === 1) {
    const one = clean[0];
    return [{ id: "t1", at: 0.2, end: r2(Math.min(end, Math.max(2.5, durationSec < 4 ? end : 3.2))), text: one.text, role: one.role === "cta" ? "cta" : "opening", size: sizeFor(one.text) }];
  }
  const opening = clean.find((l) => l.role === "opening") ?? clean[0];
  const rest = clean.filter((l) => l !== opening);
  const closing = rest.find((l) => l.role === "cta") ?? (rest.length ? rest[rest.length - 1] : null);
  const mids = rest.filter((l) => l !== closing).slice(0, MAX_OVERLAYS - 2);

  const out: EdlText[] = [];
  const openEnd = Math.min(3.2, durationSec * 0.3);
  out.push({ id: "t1", at: 0.2, end: r2(openEnd), text: opening.text, role: "opening", size: sizeFor(opening.text) });
  const closeAt = closing ? Math.max(openEnd + 0.3, durationSec - 3) : end;
  // The middle lines: 2.5 s each, where SOCIA saw the moment if that fits, otherwise evenly.
  const room = { from: openEnd + 0.3, to: closeAt - 0.3 };
  let cursor = room.from;
  mids.forEach((m, i) => {
    const even = room.from + ((room.to - room.from) * (i + 1)) / (mids.length + 1) - 1.25;
    const want = m.t != null && m.t >= room.from && m.t + 1.5 <= room.to ? m.t : even;
    const at = Math.max(cursor, want);
    const stop = Math.min(at + 2.5, room.to);
    if (stop - at < 1.5) return;
    out.push({ id: `t${out.length + 1}`, at: r2(at), end: r2(stop), text: m.text, role: "mid", size: sizeFor(m.text) });
    cursor = stop + 0.3;
  });
  if (closing && end - closeAt >= 1.5) out.push({ id: `t${out.length + 1}`, at: r2(closeAt), end: r2(end), text: closing.text, role: closing.role === "cta" ? "cta" : "mid", size: sizeFor(closing.text) });
  return out;
}

/**
 * The look for text SOCIA adds: the brand's saved look when it has one;
 * otherwise a clean sans in the plain creator style, white on a dark box, or
 * dark on a white box when the footage itself is dark. The ask's box is
 * near-black, never a bright brand-ish colour SOCIA would be making up.
 */
export function overlayStyle(args: { preset: EdlStyle | null; brightness: "dark" | "ok" | "bright" | null | undefined }): EdlStyle {
  if (args.preset) return args.preset;
  return { ...DEFAULT_STYLE, font: "inter", accent: "#111111", textBox: args.brightness === "dark" ? "light" : "dark" };
}
