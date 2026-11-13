// On-screen text as locked presets. A person types a line and picks one of
// six looks; the look decides the font, size range, colours, box, where it
// sits and how it comes in. Nothing is dragged, resized or rotated, so every
// line always lands inside the part of the frame that Instagram Reels and
// TikTok leave clear. Positions are relative to that safe zone, never the raw
// frame, and scale from the 1080×1920 reference to any output size. The
// renderer (lib/textRender.ts) draws a preset identically for the preview
// and the export. Pure: no DOM here.
import type { FontId } from "./studioClips/style";

/** The reference frame the numbers below are written for. */
export const REF_FRAME = { width: 1080, height: 1920 } as const;

/**
 * One zone that is clear on both Instagram Reels and TikTok at 1080×1920:
 * the top bar, the bottom caption/username area, and the right-hand column
 * of icons. Insets scale with the frame: left/right by its width, top/bottom
 * by its height.
 */
export const SAFE_INSETS_REF = { top: 250, bottom: 480, left: 60, right: 140 } as const;

export type SafeZone = { x: number; y: number; width: number; height: number };

export function safeZoneFor(width: number, height: number): SafeZone {
  const sx = width / REF_FRAME.width, sy = height / REF_FRAME.height;
  const left = Math.round(SAFE_INSETS_REF.left * sx), right = Math.round(SAFE_INSETS_REF.right * sx);
  const top = Math.round(SAFE_INSETS_REF.top * sy), bottom = Math.round(SAFE_INSETS_REF.bottom * sy);
  return { x: left, y: top, width: Math.max(0, width - left - right), height: Math.max(0, height - top - bottom) };
}

/** Type and spacing scale from the reference: the short side against 1080, so 16:9 doesn't blow up. */
export const frameScale = (width: number, height: number): number => Math.min(width, height) / REF_FRAME.width;

export type TextSlot = "top" | "middle" | "bottom";
export const TEXT_SLOTS: { id: TextSlot; label: string }[] = [{ id: "top", label: "Top" }, { id: "middle", label: "Middle" }, { id: "bottom", label: "Bottom" }];

export type TextPresetId = "hook_pair" | "step_label" | "hook_title" | "caption_bar" | "callout_box" | "lower_third" | "big_stat" | "subtitle" | "clip_headline";
export const TEXT_PRESET_IDS: TextPresetId[] = ["hook_pair", "step_label", "hook_title", "caption_bar", "callout_box", "lower_third", "big_stat", "subtitle"];

export type TextAnimation = "fade" | "pop";

/** Colours for text on video: white on black, as CapCut's defaults are. Big Stat's number is the one accent. */
export const BRAND = { black: "#000000", white: "#ffffff", yellow: "#ffd400" } as const;

export type TextFont = { family: FontId; weight: number; italic?: boolean };

export type TextBoxStyle = {
  /** A filled box behind the text, an outline around the letters, a soft shadow only, or nothing. */
  kind: "fill" | "outline" | "shadow";
  fill?: string;
  /** Padding around the text, px at the reference size. */
  padding: { x: number; y: number };
  radius: number;
  /** The box spans the whole safe-zone width (a bar) rather than hugging the text. */
  fullWidth?: boolean;
  /** Letter outline, as a share of the font size. */
  strokeRatio?: number;
  strokeColor?: string;
  shadow?: { blur: number; offsetY: number; color: string };
  /** Shadow look: a tight dark halo drawn under the letters before the soft shadow, for bright footage. */
  halo?: string;
  /** A short vertical bar on the left of the box in this colour (lower third). */
  accentBar?: string;
};

export type TextPreset = {
  id: TextPresetId;
  label: string;
  hint: string;
  /** A line that shows the look in the picker. */
  sample: string;
  font: TextFont;
  /** Font size range, px at the reference size; the renderer shrinks from max toward min to fit. */
  size: { min: number; max: number };
  lineHeight: number;
  letterSpacing: number;
  uppercase?: boolean;
  maxLines: number;
  maxChars: number;
  color: string;
  box: TextBoxStyle;
  align: "center" | "left";
  /** Width of the text box as a share of the safe zone's width. */
  widthPct: number;
  slot: TextSlot;
  /** Default timing, seconds from the start of the video. */
  time: { start: number; end: number };
  animation: TextAnimation;
  /**
   * Big Stat: the first line is the number, drawn with this font and size; the
   * lines after it are the subline in the preset's own font and size.
   */
  /** the body keeps its own font (Hook Pair's italic serif); the video's font goes to the lead instead */
  fixedBody?: boolean;
  lead?: { font: TextFont; size: { min: number; max: number }; color: string; gap: number; /** a single line is set as body, not as the lead (Hook Pair) */ needsBody?: boolean };
};

// Noah, 2026-11-06: text must look like a creator typed it in CapCut, not like
// a web app. One font and one look through a video: white with a black outline,
// and at most one solid label that hugs its words. No full-width bars, no
// coloured buttons, no accent stripes.
const BOLD: TextFont = { family: "montserrat", weight: 800 };
const OUTLINE = { kind: "outline", padding: { x: 0, y: 8 }, radius: 0, strokeRatio: 0.11, strokeColor: BRAND.black } as const;
// The clean look (2026-11-11 study, docs/studio/edit-references.md): the polished
// Reels set white type with a soft shadow and no outline; the outline is the
// lo-fi native look. Presets drawn with OUTLINE switch to this one when the
// video's text background is "none" (presetInStyle).
const SHADOW: TextBoxStyle = { kind: "shadow", padding: { x: 0, y: 10 }, radius: 0, shadow: { blur: 26, offsetY: 3, color: "rgba(0,0,0,0.6)" }, halo: "rgba(0,0,0,0.55)" };
const SERIF_ITALIC: TextFont = { family: "serif", weight: 400, italic: true };

export const TEXT_PRESETS: Record<TextPresetId, TextPreset> = {
  // The hook the high-end Reels use: a small italic serif line over one or two
  // big heavy words ("the first slice" / "STRAIGHT OUT"). First line is the
  // small one; the lines after it are set big.
  hook_pair: {
    // Noah's caption taste (2026-11-12): a bold line, then the key word set big in the italic serif.
    id: "hook_pair", label: "Hook Pair", hint: "A bold line over one or two big words in italic serif. First line is the bold one.", sample: "wait for the\ncheese pull",
    font: SERIF_ITALIC, size: { min: 92, max: 200 }, lineHeight: 0.95, letterSpacing: -0.01,
    maxLines: 3, maxChars: 34, color: BRAND.white,
    box: SHADOW,
    align: "center", widthPct: 0.94, slot: "top", time: { start: 0, end: 2.6 }, animation: "pop",
    lead: { font: BOLD, size: { min: 56, max: 88 }, color: BRAND.white, gap: 6, needsBody: true },
    fixedBody: true,
  },
  // How the food Reels that work set their words (2026-11-11 food study,
  // docs/studio/edit-references.md): no big title, a small lowercase label in
  // the middle of the frame naming the dish, the ingredient or the step
  // ("butter", "green onions").
  step_label: {
    id: "step_label", label: "Step Label", hint: "A small label in the middle naming the dish, the ingredient or the step.", sample: "fresh basil",
    font: { family: "montserrat", weight: 600 }, size: { min: 42, max: 58 }, lineHeight: 1.15, letterSpacing: 0,
    maxLines: 2, maxChars: 32, color: BRAND.white,
    box: SHADOW,
    align: "center", widthPct: 0.86, slot: "middle", time: { start: 0, end: 2 }, animation: "fade",
  },
  hook_title: {
    id: "hook_title", label: "Hook Title", hint: "Big and bold at the top. The first thing they read.", sample: "Wait for it",
    font: BOLD, size: { min: 56, max: 84 }, lineHeight: 1.12, letterSpacing: -0.01,
    maxLines: 3, maxChars: 40, color: BRAND.white,
    box: OUTLINE,
    align: "center", widthPct: 1, slot: "top", time: { start: 0, end: 3 }, animation: "pop",
  },
  // The AI Clipper's headline, up for a whole clip above the picture. Not one of the looks people pick (TEXT_PRESET_IDS).
  clip_headline: {
    id: "clip_headline", label: "Clip headline", hint: "A small headline above the picture for the whole clip.", sample: "Why sleep comes first",
    font: BOLD, size: { min: 38, max: 50 }, lineHeight: 1.15, letterSpacing: 0,
    maxLines: 3, maxChars: 80, color: BRAND.white,
    box: OUTLINE,
    align: "center", widthPct: 1, slot: "top", time: { start: 0, end: 3 }, animation: "fade",
  },
  caption_bar: {
    id: "caption_bar", label: "Caption", hint: "White words with a black outline, low in the frame.", sample: "Open every day from 7am",
    font: BOLD, size: { min: 38, max: 54 }, lineHeight: 1.18, letterSpacing: 0,
    maxLines: 2, maxChars: 80, color: BRAND.white,
    box: OUTLINE,
    align: "center", widthPct: 1, slot: "bottom", time: { start: 0, end: 5 }, animation: "fade",
  },
  callout_box: {
    id: "callout_box", label: "Label", hint: "Black words on a white label that hugs them. Good for one call to action.", sample: "Only 20 made a day",
    font: BOLD, size: { min: 40, max: 56 }, lineHeight: 1.18, letterSpacing: 0,
    maxLines: 3, maxChars: 60, color: BRAND.black,
    box: { kind: "fill", fill: BRAND.white, padding: { x: 30, y: 18 }, radius: 14 },
    align: "center", widthPct: 0.86, slot: "bottom", time: { start: 1, end: 4 }, animation: "pop",
  },
  lower_third: {
    id: "lower_third", label: "Tag", hint: "A small dark tag low in the frame. Names, places, prices.", sample: "Downtown, since 2019",
    font: BOLD, size: { min: 28, max: 36 }, lineHeight: 1.2, letterSpacing: 0,
    maxLines: 2, maxChars: 50, color: BRAND.white,
    box: { kind: "fill", fill: BRAND.black, padding: { x: 24, y: 14 }, radius: 10 },
    align: "left", widthPct: 0.72, slot: "bottom", time: { start: 0, end: 4 }, animation: "fade",
  },
  big_stat: {
    id: "big_stat", label: "Big Stat", hint: "A huge number with a small line under it. First line is the number.", sample: "200+\nburgers every Friday",
    font: BOLD, size: { min: 32, max: 42 }, lineHeight: 1.2, letterSpacing: 0,
    maxLines: 3, maxChars: 52, color: BRAND.white,
    box: OUTLINE,
    align: "center", widthPct: 0.9, slot: "middle", time: { start: 0, end: 3 }, animation: "pop",
    lead: { font: { family: "anton", weight: 400 }, size: { min: 120, max: 190 }, color: BRAND.yellow, gap: 10 },
  },
  subtitle: {
    id: "subtitle", label: "Plain Subtitle", hint: "Smaller white words with a black outline at the bottom. Fits over anything.", sample: "we start the dough at 5am",
    font: BOLD, size: { min: 34, max: 46 }, lineHeight: 1.22, letterSpacing: 0,
    maxLines: 2, maxChars: 80, color: BRAND.white,
    box: OUTLINE,
    align: "center", widthPct: 1, slot: "bottom", time: { start: 0, end: 5 }, animation: "fade",
  },
};

/** A preset in the video's own font, so every line matches. Older cuts set to a dropped font keep Montserrat. */
export function presetInFont(p: TextPreset, font?: FontId | null): TextPreset {
  if (!font || font === "inter" || font === "playfair" || font === "serif") return p;
  if (p.fixedBody && p.lead) return { ...p, lead: { ...p.lead, font: { family: font, weight: font === "anton" || font === "bebas" ? 400 : 800 } } };
  // Anton and Bebas come in one weight; the others keep a lighter preset weight (Step Label) and are bold otherwise.
  return { ...p, font: { family: font, weight: font === "anton" || font === "bebas" ? 400 : p.font.weight < 800 ? p.font.weight : 800 } };
}

/**
 * A preset as this video draws it: in the video's font, and with the video's
 * text background. "outline" keeps CapCut's outlined letters; any other
 * background draws the outlined presets with the clean soft shadow instead.
 * Labels and tags keep their own boxes.
 */
export function presetInStyle(p: TextPreset, font?: FontId | null, textBox?: string | null): TextPreset {
  const f = presetInFont(p, font);
  if (textBox === "outline" && f.box === SHADOW) return { ...f, box: OUTLINE };
  return textBox && textBox !== "outline" && f.box.kind === "outline" ? { ...f, box: SHADOW } : f;
}

/** The look for a new line: an opening written as two lines (small line, then the big words) is a Hook Pair. */
export function presetForLine(role: TextRole | string | null | undefined, text: string): TextPreset {
  if (role === "opening" && text.split("\n").filter((l) => l.trim()).length >= 2) return TEXT_PRESETS.hook_pair;
  return presetForRole(role);
}

/**
 * A one-line opening as a Hook Pair: the line in bold, its last word (the last
 * two when that word is one or two letters) set big in the italic serif below it. Noah's
 * caption taste (2026-11-12): "fresh out of the oven" plain was "so basic";
 * "fresh out of the / oven" is the look he picked. Null when it doesn't split
 * well: under three words, already two lines, or a key word too long to set big.
 */
export function asHookPair(text: string): string | null {
  const t = text.trim();
  if (!t || t.includes("\n")) return null;
  const words = t.split(/\s+/);
  if (words.length < 3) return null;
  const take = words[words.length - 1].replace(/[^\p{L}\p{N}']/gu, "").length <= 2 ? 2 : 1;
  const key = words.slice(-take).join(" ");
  if (key.length > 14) return null;
  return `${words.slice(0, -take).join(" ")}\n${key}`;
}

/** How many lines of text one video may carry. */
export const MAX_TEXT_LAYERS = 5;

export const isTextPresetId = (v: unknown): v is TextPresetId => typeof v === "string" && (TEXT_PRESET_IDS as string[]).includes(v);
export const isTextSlot = (v: unknown): v is TextSlot => v === "top" || v === "middle" || v === "bottom";

/** The semantic tag SOCIA keeps on a line (opening / mid / cta), for cuts that predate presets. */
export type TextRole = "opening" | "mid" | "cta";

/** Cuts made before presets existed carry only a role: it maps to the closest look. */
export function presetForRole(role: TextRole | string | null | undefined): TextPreset {
  if (role === "opening") return TEXT_PRESETS.hook_title;
  if (role === "cta") return TEXT_PRESETS.callout_box;
  return TEXT_PRESETS.caption_bar;
}

/** The preset a stored line renders with: its own, or the one for its role. */
export function presetOf(line: { presetId?: string | null; role?: string | null }): TextPreset {
  return isTextPresetId(line.presetId) || line.presetId === "clip_headline" ? TEXT_PRESETS[line.presetId] : presetForRole(line.role);
}

/** Characters as a person counts them (an emoji is one), so the counter and the limit agree. */
export const charCount = (s: string): number => Array.from(s).length;

/** Cut a line to a preset's limit at a character, never inside a surrogate pair. */
export function clampChars(s: string, max: number): string {
  const chars = Array.from(s);
  return chars.length <= max ? s : chars.slice(0, max).join("").trimEnd();
}

/** Words a shortened line never ends on: they promise a word that isn't there ("looking like"). */
const DANGLING = new Set(["a", "an", "the", "and", "or", "but", "so", "to", "of", "with", "for", "in", "on", "at", "by", "from", "like", "as", "is", "are", "was", "be", "your", "my", "our", "their", "this", "that", "these", "those", "when", "if", "than", "then", "into", "onto", "about", "just", "very"]);

/**
 * Shorten a line to a limit at a whole word, never inside one, and drop a
 * dangling word at the end ("comes out looking like th" becomes "comes out
 * looking"). A single word longer than the limit is the one case cut at a
 * character. Trailing commas and dashes go too.
 */
export function clampWords(s: string, max: number): string {
  const t = s.trim();
  if (charCount(t) <= max) return t;
  const words = t.split(/\s+/);
  const kept: string[] = [];
  for (const w of words) {
    if (charCount([...kept, w].join(" ")) > max) break;
    kept.push(w);
  }
  if (!kept.length) return clampChars(t, max);
  while (kept.length > 1 && DANGLING.has(kept[kept.length - 1].toLowerCase().replace(/[^\p{L}]/gu, ""))) kept.pop();
  return kept.join(" ").replace(/[\s,;:–-]+$/u, "");
}

/**
 * The look a line SOCIA wrote goes in, and its words. The asked-for preset
 * when the words fit; otherwise the roomier Caption, kept in the asked-for
 * preset's place on screen (a long hook stays at the top); only when even
 * that is too small is the line shortened, at a whole word. `shortened` says
 * so, for the cut check.
 */
export function fitLine(text: string, preset: TextPreset): { text: string; preset: TextPreset; slot?: TextSlot; shortened: boolean } {
  const t = text.trim();
  if (charCount(t) <= preset.maxChars) return { text: t, preset, shortened: false };
  const roomy = TEXT_PRESETS.caption_bar;
  const slot = roomy.slot !== preset.slot ? preset.slot : undefined;
  if (charCount(t) <= roomy.maxChars) return { text: t, preset: roomy, slot, shortened: false };
  return { text: clampWords(t, roomy.maxChars), preset: roomy, slot, shortened: true };
}

/** Default timing for a new line of this preset inside a video of this length. */
export function defaultTiming(preset: TextPreset, durationSec: number, atSec?: number | null): { at: number; end: number } {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const dur = Math.max(0.5, durationSec);
  const len = preset.time.end - preset.time.start;
  const start = typeof atSec === "number" && Number.isFinite(atSec) ? Math.max(0, Math.min(atSec, dur - 0.5)) : Math.min(preset.time.start, Math.max(0, dur - 0.5));
  return { at: r2(start), end: r2(Math.min(dur, Math.max(start + 0.5, start + len))) };
}

/** Looks a label-style edit (food and process, calm) swaps for a Step Label. */
const TO_LABEL = new Set<TextPresetId>(["hook_pair", "hook_title", "caption_bar", "subtitle", "clip_headline"]);

/**
 * A line as a Step Label: on one line, and with words written all in capitals
 * (a Hook Pair's big words) set in lowercase, as the food Reels label their
 * steps. Shortened only at a whole word.
 */
export function asStepLabel(text: string): { text: string; shortened: boolean } {
  const t = text.replace(/\s*\n+\s*/g, " ").split(" ").map((w) => (/\p{Lu}{2,}/u.test(w) && w === w.toUpperCase() ? w.toLowerCase() : w)).join(" ").trim();
  const max = TEXT_PRESETS.step_label.maxChars;
  return charCount(t) <= max ? { text: t, shortened: false } : { text: clampWords(t, max), shortened: true };
}

/** Whether a line on this look becomes a Step Label in a label-style edit (calls to action keep their label). */
export const becomesStepLabel = (presetId: string | undefined): boolean => !!presetId && TO_LABEL.has(presetId as TextPresetId);
