// Applying a theme to a cut: everything the theme decides (the look, the
// captions, the transitions, the motion in each cut, the overlays) is
// written onto the EDL from the one theme object; what the person made (the
// trims, the order, the words of every line, captions on or off, the end
// card's words, the music) is left exactly as it was. Switching themes is
// therefore instant and reversible, and the person's own changes on top of a
// theme are kept as a diff (edl.theme.overrides) that "Reset to theme"
// clears. Pure, unit-tested (apply.test.ts).
import { sentences } from "../speech";
import type { Edl, EdlSegment, SegmentMotion, TranscriptWord, TransitionKind } from "../types";
import { DEFAULT_STYLE, type CaptionAnimation, type CaptionPosition, type CaptionSize, type CaptionStyleId, type EdlStyle, type FontId, type TextBox } from "../style";
import { TEXT_PRESETS, fitLine, isTextPresetId, type TextPresetId } from "@/lib/textPresets";
import { deepDiff, withOverrides, type Theme } from "./schema";
import { themeById } from "./index";
import { cleanPunches } from "../punch";

const r2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}$%]/gu, "");

/** The theme a cut really uses (its theme with the person's overrides), or null when it has none. */
export function resolveTheme(edl: Pick<Edl, "theme">): Theme | null {
  const base = themeById(edl.theme?.id);
  return base ? withOverrides(base, edl.theme?.overrides) : null;
}

/** The edit style a theme sets: font, accent, text background and the caption look. */
export function styleFromTheme(t: Theme): EdlStyle {
  const ty = t.typography;
  const size: CaptionSize = ty.sizeScale >= 1.15 ? "l" : ty.sizeScale <= 0.92 ? "s" : "m";
  return {
    font: ty.font as FontId,
    accent: t.color.accent,
    textBox: ty.textBox as TextBox,
    captions: {
      position: ty.captionPosition as CaptionPosition,
      size,
      box: ty.pill,
      uppercase: ty.transform === "upper",
      preset: ty.captionPreset as CaptionStyleId,
      highlight: ty.highlight,
      animation: ty.captionAnimation as CaptionAnimation,
    },
  };
}

export type ApplyContext = {
  /** transcript words by clip id, for sentence steps and word punches */
  words?: Record<string, TranscriptWord[] | null | undefined>;
};

/** Times in a clip where the emphasised words are said, inside the cut. */
function punchTimes(s: EdlSegment, words: TranscriptWord[] | null | undefined, emphasis: string[] | undefined): number[] {
  if (!words?.length || !emphasis?.length) return [];
  const marked = new Set(emphasis);
  return words.filter((w) => marked.has(norm(w.text)) && w.startMs / 1000 >= s.in && w.startMs / 1000 <= s.out).map((w) => r2(w.startMs / 1000));
}

/** The motion a theme gives one cut: its slow move (alternating in and out on the fast themes), word punches and shake. */
export function motionForSegment(t: Theme, s: EdlSegment, index: number, words: TranscriptWord[] | null | undefined, emphasis: string[] | undefined): SegmentMotion | undefined {
  const m: SegmentMotion = {};
  const z = t.motion.zoom;
  if (z.kind !== "none" && (z.from !== 1 || z.to !== 1)) {
    const flip = z.kind === "out" || (z.kind === "alternate" && index % 2 === 1);
    const focal = s.frame ? { x: s.frame.x, y: s.frame.y } : { x: 0.5, y: 0.45 };
    m.zoom = { from: flip ? z.to : z.from, to: flip ? z.from : z.to, x: focal.x, y: focal.y, ease: z.ease };
  }
  if (t.motion.shake > 0) m.shake = t.motion.shake;
  if (t.motion.punchIn > 0) {
    const at = punchTimes(s, words, emphasis);
    if (at.length) m.punch = { at: at.slice(0, 40), amount: t.motion.punchIn };
  }
  return Object.keys(m).length ? m : undefined;
}

/** Sentence ends inside a talking cut, as punch-in points, so the frame steps in and out as the speaker moves on. */
export function sentencePunches(s: EdlSegment, words: TranscriptWord[] | null | undefined): number[] {
  if (!words?.length) return [];
  const inside = words.filter((w) => w.startMs / 1000 >= s.in && w.endMs / 1000 <= s.out);
  if (inside.length < 4) return [];
  const ends = sentences(inside).slice(0, -1).map(([, b]) => r2(inside[b].endMs / 1000));
  return cleanPunches(ends, s.in, s.out);
}

/**
 * The cut with the theme applied. Trims, order, words, captions on or off,
 * the end card's words, the music and the voiceover stay; the style, the
 * transitions, the motion in every unlocked cut and the opening line's look
 * follow the theme. Overrides are cleared (this is the theme as shipped).
 */
export function applyTheme(edl: Edl, theme: Theme, ctx: ApplyContext = {}): Edl {
  const words = ctx.words ?? {};
  const transition = theme.motion.transition as TransitionKind;
  const segments = edl.segments.map((s, i) => {
    const next: EdlSegment = { ...s };
    if (i > 0) { if (transition === "cut") delete next.transition; else next.transition = transition; }
    else delete next.transition;
    if (!s.motion?.locked) {
      const m = motionForSegment(theme, s, i, words[s.clipId], edl.emphasis);
      if (m) next.motion = m; else delete next.motion;
    }
    // Talking-head themes step the zoom at sentence ends; other themes leave a cut's own punches alone.
    if (theme.motion.alternateZoom) {
      const p = sentencePunches(s, words[s.clipId]);
      if (p.length) next.punches = p;
    }
    return next;
  });
  // The opening line takes the theme's title look; the words are the person's.
  const title = theme.typography.titlePreset as TextPresetId;
  const text = edl.text.map((t) => {
    if (t.role !== "opening" || !isTextPresetId(title)) return t;
    const fit = fitLine(t.text, TEXT_PRESETS[title]);
    const { slot: _slot, ...rest } = t; void _slot;
    return { ...rest, text: fit.text, presetId: fit.preset.id, ...(fit.slot ? { slot: fit.slot } : {}), ...(fit.shortened ? { shortened: true as const } : {}) };
  });
  const out: Edl = { ...edl, segments, text, style: styleFromTheme(theme), theme: { id: theme.id } };
  if (out.soundtrack) out.soundtrack = theme.audio.duck < 1 ? { ...out.soundtrack, duck: true } : (({ duck: _d, ...st }) => { void _d; return st; })(out.soundtrack);
  return out;
}

/**
 * A change on top of the theme (the Text, Captions, Effects, Transitions
 * or Adjust tabs): kept as a diff against the shipped theme, and the cut
 * re-styled from the result. Per-cut motion the person set stays locked.
 */
export function setThemeOverride(edl: Edl, patch: Record<string, unknown>, ctx: ApplyContext = {}): Edl {
  const base = themeById(edl.theme?.id);
  if (!base) return edl;
  const current = withOverrides(base, edl.theme?.overrides);
  const next = withOverrides(current, patch);
  const applied = applyTheme(edl, next, ctx);
  const overrides = deepDiff(base, next);
  return { ...applied, theme: { id: base.id, ...(overrides ? { overrides } : {}) } };
}

/** The theme as shipped: overrides dropped, every cut's own motion unlocked and set again. */
export function resetToTheme(edl: Edl, ctx: ApplyContext = {}): Edl {
  const base = themeById(edl.theme?.id);
  if (!base) return edl;
  const unlocked = { ...edl, segments: edl.segments.map((s) => { if (!s.motion?.locked) return s; const { locked: _l, ...m } = s.motion; void _l; return { ...s, motion: m }; }) };
  return applyTheme(unlocked, base, ctx);
}

/** The style a cut draws with: its theme's, or its own, or the default. */
export const effectiveStyle = (edl: Pick<Edl, "style" | "theme">): EdlStyle => edl.style ?? (resolveTheme(edl) ? styleFromTheme(resolveTheme(edl)!) : DEFAULT_STYLE);
