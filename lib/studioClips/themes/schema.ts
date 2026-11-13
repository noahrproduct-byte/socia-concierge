// A theme is one declarative object that fully describes how an edit looks,
// moves and sounds. Everything a themed cut does is derived from it
// (lib/studioClips/themes/apply.ts), so a new theme is a JSON file in this
// folder, registered in index.ts, and no rendering code changes. The zod
// schema validates the JSON files at load and bounds a person's overrides
// (a partial theme stored on the cut as a diff). Pure.
import { z } from "zod";
import { CAPTION_ANIMATIONS, CAPTION_STYLES, FONTS } from "../style";
import { TEXT_PRESET_IDS } from "@/lib/textPresets";
import { TRANSITIONS } from "../types";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/).transform((s) => s.toLowerCase());
const unit = z.number().min(0).max(1);
const fontIds = FONTS.filter((f) => f.id !== "serif").map((f) => f.id) as [string, ...string[]];

export const themeSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{1,30}$/),
  name: z.string().min(1).max(40),
  description: z.string().min(1).max(320),
  /** The one line under the name in the picker: who it suits. */
  bestFor: z.string().min(1).max(80),
  tags: z.array(z.string().max(24)).max(8),
  /** What the picker's card shows on the person's own footage: a title and a caption line. */
  sample: z.object({ title: z.string().max(40), caption: z.string().max(40) }),
  typography: z.object({
    font: z.enum(fontIds),
    weight: z.union([z.literal(400), z.literal(600), z.literal(700), z.literal(800)]),
    /** Caption and title type size against the house size (1 = as the caption style sets it). */
    sizeScale: z.number().min(0.7).max(1.5),
    /** As a share of the type size (-0.05 to 0.2). */
    letterSpacing: z.number().min(-0.05).max(0.2),
    transform: z.enum(["none", "upper", "lower"]),
    captionPosition: z.enum(["top", "middle", "lower", "bottom"]),
    align: z.enum(["center", "left"]),
    maxWords: z.number().int().min(1).max(7),
    /** The caption style the words come in (CAPTION_STYLES): words per page, how the spoken word is marked. */
    captionPreset: z.enum(CAPTION_STYLES.map((c) => c.id) as [string, ...string[]]),
    captionAnimation: z.enum(CAPTION_ANIMATIONS.map((a) => a.id) as [string, ...string[]]),
    /** The outline, the clean shadow, or a dark, light or brand-coloured pill behind the words. */
    textBox: z.enum(["outline", "none", "dark", "light", "accent"]),
    /** A pill behind the captions. */
    pill: z.boolean(),
    highlight: hex,
    /** The look the opening line (the hook) is set in. */
    titlePreset: z.enum(TEXT_PRESET_IDS as [string, ...string[]]),
  }),
  color: z.object({
    primary: hex,
    accent: hex,
    text: hex,
    captionBg: hex,
    /** The look on the picture, on the same scales as @remotion/effects (lib/studioClips/look.ts). */
    grade: z.object({
      contrast: z.number().min(0.8).max(1.4),
      saturation: z.number().min(0).max(1.5),
      /** Warm (+) or cool (-), -1 to 1. */
      warmth: z.number().min(-1).max(1),
      vignette: unit,
      grain: unit,
      /** RGB channel separation in pixels at 1080 wide. */
      chroma: z.number().min(0).max(12),
      scanlines: unit,
      /** Black bars top and bottom, as a share of the frame height per bar (0 = none). */
      letterbox: z.number().min(0).max(0.2),
    }),
  }),
  motion: z.object({
    zoom: z.object({
      kind: z.enum(["in", "out", "alternate", "none"]),
      /** Start and end scale of the slow move (1 = the frame as cut). */
      from: z.number().min(1).max(1.6),
      to: z.number().min(1).max(1.6),
      ease: z.enum(["inOut", "linear", "out"]),
    }),
    /** How much closer a punch-in on an emphasised word goes (0 = none, 0.12 = 12 percent). */
    punchIn: z.number().min(0).max(0.3),
    /** Handheld shake 0 to 1. */
    shake: unit,
    transition: z.enum(TRANSITIONS.map((t) => t.id) as [string, ...string[]]),
    /** Transition length in frames at 30 fps (soft joins only). */
    transitionFrames: z.number().int().min(2).max(24),
    /** Target seconds per B-roll shot. */
    brollSec: z.number().min(0.5).max(8),
    beatSync: z.boolean(),
    /** Talking-head footage: step the zoom in and out at sentence ends. */
    alternateZoom: z.boolean(),
  }),
  layout: z.object({
    lowerThird: z.enum(["none", "tag", "pill", "bar"]),
    progressBar: z.boolean(),
    /** A small brand mark in the corner when the account has one. */
    watermark: z.boolean(),
    /** How the opening line is treated: as the hook over the first shot (never a card on its own: house rule). */
    intro: z.enum(["none", "title"]),
    /** The ending: a call-to-action card over the last shot, or nothing. */
    outro: z.enum(["none", "cta"]),
    frame: z.enum(["none", "letterbox", "border"]),
    /** A camcorder date stamp in the corner. */
    dateStamp: z.boolean(),
  }),
  audio: z.object({
    mood: z.enum(["upbeat", "cinematic", "lofi", "none"]),
    /** How low the music sits under speech, 0 (silent) to 1 (no ducking). */
    duck: unit,
    sfx: z.boolean(),
  }),
  pacing: z.object({
    /** Pull the strongest spoken line to the front as a big text hook. */
    hook: z.boolean(),
    /** No cut runs longer than this before the next. */
    maxClipSec: z.number().min(1).max(20),
    /** A pause longer than this is trimmed out of speech. */
    silenceSec: z.number().min(0.2).max(3),
  }),
});

export type Theme = z.infer<typeof themeSchema>;
export type ThemeTypography = Theme["typography"];
export type ThemeGrade = Theme["color"]["grade"];

/** Any theme from JSON: throws on a bad file (so a broken theme fails the build's tests, never the editor). */
export const parseTheme = (raw: unknown): Theme => themeSchema.parse(raw);

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain => !!v && typeof v === "object" && !Array.isArray(v);

/** `base` with `patch` laid over it, object by object (arrays and scalars replace). */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlain(base) || !isPlain(patch)) return (patch === undefined ? base : patch) as T;
  const out: Plain = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = isPlain(v) && isPlain(base[k]) ? deepMerge(base[k], v) : v;
  return out as T;
}

/** Only what differs between `full` and `base`, object by object: the diff stored on a cut. */
export function deepDiff(base: unknown, full: unknown): Record<string, unknown> | undefined {
  if (!isPlain(base) || !isPlain(full)) return undefined;
  const out: Plain = {};
  for (const [k, v] of Object.entries(full)) {
    const b = base[k];
    if (isPlain(v) && isPlain(b)) { const d = deepDiff(b, v); if (d && Object.keys(d).length) out[k] = d; }
    else if (JSON.stringify(v) !== JSON.stringify(b)) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * The theme a cut really uses: the named theme with the person's overrides
 * laid over it, every value bounded by the schema (a bad override falls back
 * to the theme's value, never to nothing).
 */
export function withOverrides(theme: Theme, overrides: unknown): Theme {
  if (!isPlain(overrides)) return theme;
  const merged = deepMerge(theme, overrides);
  const r = themeSchema.safeParse(merged);
  if (r.success) return r.data;
  // Drop the paths that failed and parse again; the identity fields always stay the theme's.
  const cleaned = { ...merged, id: theme.id, name: theme.name, description: theme.description, bestFor: theme.bestFor, tags: theme.tags, sample: theme.sample } as Plain;
  for (const issue of r.error.issues) {
    let node: Plain = cleaned, parent: Plain | null = null, last = "";
    for (const key of issue.path) { parent = node; last = String(key); if (!isPlain(node[last])) break; node = node[last] as Plain; }
    if (parent && last in parent) delete parent[last];
  }
  const again = themeSchema.safeParse(deepMerge(theme, cleaned));
  return again.success ? again.data : theme;
}
