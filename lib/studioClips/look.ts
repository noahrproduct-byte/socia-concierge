// A theme's look on the picture as a plan of effects: colour (contrast,
// saturation, warmth on @remotion/effects' colorCorrection scales), a
// vignette, film grain, a chroma split and scanlines, plus letterbox bars.
// The composition turns the plan into WebGL effects on the video, so the
// Player and the browser render agree. Pure (no @remotion/effects import
// here), unit-tested.
import type { ThemeGrade } from "./themes/schema";
import type { GradeParams } from "./types";
import { NEUTRAL } from "./grade";

export type LookStep =
  | { kind: "color"; params: GradeParams }
  | { kind: "vignette"; amount: number; radius: number; feather: number }
  | { kind: "grain"; amount: number; seed: number }
  | { kind: "chroma"; amount: number }
  | { kind: "scanlines"; amount: number; spacing: number };

/** Grain re-rolls this often (frames), so it lives without flickering every frame. */
const GRAIN_STEP = 2;

/** The effects for a grade at a frame of a frame `width` px wide. Neutral values add nothing. */
export function lookPlan(g: ThemeGrade | null | undefined, frame: number, width: number): LookStep[] {
  if (!g) return [];
  const out: LookStep[] = [];
  const params: GradeParams = { ...NEUTRAL, contrast: g.contrast, saturation: g.saturation, temperature: g.warmth * 0.75 };
  if (params.contrast !== 1 || params.saturation !== 1 || params.temperature !== 0) out.push({ kind: "color", params });
  if (g.vignette > 0) out.push({ kind: "vignette", amount: Math.min(1, g.vignette * 0.9), radius: 0.7 - g.vignette * 0.15, feather: 0.45 });
  if (g.grain > 0) out.push({ kind: "grain", amount: Math.min(1, g.grain * 0.35), seed: Math.floor(frame / GRAIN_STEP) });
  if (g.chroma > 0) out.push({ kind: "chroma", amount: (g.chroma * width) / 1080 });
  if (g.scanlines > 0) out.push({ kind: "scanlines", amount: Math.min(1, g.scanlines * 0.6), spacing: Math.max(2, Math.round((4 * width) / 1080)) });
  return out;
}

/** Letterbox bar height in px for a frame, 0 when the grade has none. */
export const letterboxPx = (g: ThemeGrade | null | undefined, height: number): number => (g && g.letterbox > 0 ? Math.round(g.letterbox * height) : 0);

/** A CSS filter that approximates the grade for thumbnails (never for the render, which uses the effects). */
export function lookCssFilter(g: ThemeGrade | null | undefined): string | undefined {
  if (!g) return undefined;
  const parts: string[] = [];
  if (g.contrast !== 1) parts.push(`contrast(${g.contrast.toFixed(2)})`);
  if (g.saturation !== 1) parts.push(`saturate(${g.saturation.toFixed(2)})`);
  if (g.warmth > 0) parts.push(`sepia(${(g.warmth * 0.25).toFixed(2)})`);
  if (g.warmth < 0) parts.push(`hue-rotate(${Math.round(g.warmth * -12)}deg)`);
  return parts.length ? parts.join(" ") : undefined;
}
