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

export type TextPresetId = "hook_title" | "caption_bar" | "callout_box" | "lower_third" | "big_stat" | "subtitle";
export const TEXT_PRESET_IDS: TextPresetId[] = ["hook_title", "caption_bar", "callout_box", "lower_third", "big_stat", "subtitle"];

export type TextAnimation = "fade" | "pop";

/** Colours for text on video: white on black, as CapCut's defaults are. Big Stat's number is the one accent. */
export const BRAND = { black: "#000000", white: "#ffffff", yellow: "#ffd400" } as const;

export type TextFont = { family: FontId; weight: number };

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
  lead?: { font: TextFont; size: { min: number; max: number }; color: string; gap: number };
};

// Noah, 2026-11-06: text must look like a creator typed it in CapCut, not like
// a web app. One font and one look through a video: white with a black outline,
// and at most one solid label that hugs its words. No full-width bars, no
// coloured buttons, no accent stripes.
const BOLD: TextFont = { family: "montserrat", weight: 800 };
const OUTLINE = { kind: "outline", padding: { x: 0, y: 8 }, radius: 0, strokeRatio: 0.11, strokeColor: BRAND.black } as const;

export const TEXT_PRESETS: Record<TextPresetId, TextPreset> = {
  hook_title: {
    id: "hook_title", label: "Hook Title", hint: "Big and bold at the top. The first thing they read.", sample: "Wait for it",
    font: BOLD, size: { min: 56, max: 84 }, lineHeight: 1.12, letterSpacing: -0.01,
    maxLines: 3, maxChars: 40, color: BRAND.white,
    box: OUTLINE,
    align: "center", widthPct: 1, slot: "top", time: { start: 0, end: 3 }, animation: "pop",
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
  if (!font || font === "inter" || font === "playfair") return p;
  return { ...p, font: { family: font, weight: font === "anton" || font === "bebas" ? 400 : 800 } };
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
  return isTextPresetId(line.presetId) ? TEXT_PRESETS[line.presetId] : presetForRole(line.role);
}

/** Characters as a person counts them (an emoji is one), so the counter and the limit agree. */
export const charCount = (s: string): number => Array.from(s).length;

/** Cut a line to a preset's limit at a character, never inside a surrogate pair. */
export function clampChars(s: string, max: number): string {
  const chars = Array.from(s);
  return chars.length <= max ? s : chars.slice(0, max).join("").trimEnd();
}

/** Default timing for a new line of this preset inside a video of this length. */
export function defaultTiming(preset: TextPreset, durationSec: number, atSec?: number | null): { at: number; end: number } {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const dur = Math.max(0.5, durationSec);
  const len = preset.time.end - preset.time.start;
  const start = typeof atSec === "number" && Number.isFinite(atSec) ? Math.max(0, Math.min(atSec, dur - 0.5)) : Math.min(preset.time.start, Math.max(0, dur - 0.5));
  return { at: r2(start), end: r2(Math.min(dur, Math.max(start + 0.5, start + len))) };
}
