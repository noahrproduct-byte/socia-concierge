// Auto Enhance and Match Clips: measured picture corrections. The pixel math
// below is a line-by-line copy of @remotion/effects' colorCorrection() shader
// (4.0.533), so SOCIA can predict exactly what a correction does to a clip's
// own frames before applying it, and choose the smallest one that brings the
// clip into a safe range. Every correction is capped well short of a "look":
// this fixes exposure, white balance, clipped highlights, crushed shadows and
// flat or dull footage; it never stylises. Pure, unit-tested.
import type { ClipGrade, GradeParams, LookStats } from "./types";

/** RGB triplets (8-bit), as sampled from a clip's frames. */
export type Pixels = Uint8Array;

export const NEUTRAL: GradeParams = { exposure: 0, contrast: 1, shadows: 0, highlights: 0, temperature: 0, tint: 0, saturation: 1, vibrance: 0 };

/** The furthest SOCIA will ever push a clip. */
export const LIMITS = {
  exposure: [-0.6, 0.8],
  contrast: [0.9, 1.2],
  shadows: [0, 0.6],
  // Pixels already at pure white hold no detail; pulling them further only greys them.
  highlights: [-0.35, 0],
  // colorCorrection()'s white balance is subtle: ±0.75 moves R and B by
  // about ±17% in linear light, enough to take most of a cast out.
  temperature: [-0.75, 0.75],
  tint: [-0.3, 0.3],
  saturation: [0.9, 1],
  vibrance: [0, 0.25],
} as const satisfies Record<keyof GradeParams, readonly [number, number]>;

/** What reads as well exposed and neutral; a clip inside a band is left alone. */
export const BANDS = {
  luma: [0.36, 0.62],
  contrast: [0.11, 0.3],
  // Warm light is usually wanted (food, interiors); only a strong orange cast is touched.
  warmth: [-0.02, 0.12],
  tint: [-0.03, 0.03],
  saturation: [0.12, 0.6],
  /** below this the footage is near-monochrome on purpose (or a grey subject): colour is left alone */
  monochrome: 0.06,
  clipHi: 0.03,
  clipLo: 0.1,
} as const;

// ------------------------------------------------------------ shader copy ----

const s2l = (c: number) => (c >= 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92);
const l2s = (c: number) => { const x = Math.max(c, 0); return x >= 0.0031308 ? 1.055 * Math.pow(x, 1 / 2.4) - 0.055 : x * 12.92; };
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smoothstep = (e0: number, e1: number, x: number) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const LIN8 = Array.from({ length: 256 }, (_, i) => s2l(i / 255));

const isNeutral = (p: GradeParams) =>
  p.exposure === 0 && p.contrast === 1 && p.shadows === 0 && p.highlights === 0 && p.temperature === 0 && p.tint === 0 && p.saturation === 1 && p.vibrance === 0;

/** One pixel through colorCorrection() (blacks/whites 0, pivot 0.5). Input and output are 0..1 sRGB. */
export function gradePixel(r: number, g: number, b: number, p: GradeParams, out: number[] = [0, 0, 0]): number[] {
  if (isNeutral(p)) { out[0] = r; out[1] = g; out[2] = b; return out; }
  // exposure + white balance in linear light
  const ex = Math.pow(2, p.exposure);
  let lr = s2l(r) * ex, lg = s2l(g) * ex, lb = s2l(b) * ex;
  const gr = Math.pow(2, 0.3 * p.temperature + 0.15 * p.tint), gg = Math.pow(2, -0.3 * p.tint), gb = Math.pow(2, -0.3 * p.temperature + 0.15 * p.tint);
  const lumGain = gr * 0.2126 + gg * 0.7152 + gb * 0.0722;
  lr = (lr * gr) / lumGain; lg = (lg * gg) / lumGain; lb = (lb * gb) / lumGain;
  let cr = l2s(lr), cg = l2s(lg), cb = l2s(lb);
  // shadows / highlights in stops, weighted by luminance
  const lum = cr * 0.2126 + cg * 0.7152 + cb * 0.0722;
  let sw = 1 - smoothstep(0, 0.6, lum), hw = smoothstep(0.4, 1, lum);
  sw *= sw; hw *= hw;
  const stops = Math.pow(2, p.shadows * sw + p.highlights * hw);
  cr = l2s(s2l(cr) * stops); cg = l2s(s2l(cg) * stops); cb = l2s(s2l(cb) * stops);
  // endpoint tones with blacks = whites = 0 only clamp
  cr = clamp01(cr); cg = clamp01(cg); cb = clamp01(cb);
  // contrast around 0.5
  cr = clamp01((cr - 0.5) * p.contrast + 0.5); cg = clamp01((cg - 0.5) * p.contrast + 0.5); cb = clamp01((cb - 0.5) * p.contrast + 0.5);
  // saturation
  const l2 = cr * 0.213 + cg * 0.715 + cb * 0.072;
  cr = clamp01(l2 + (cr - l2) * p.saturation); cg = clamp01(l2 + (cg - l2) * p.saturation); cb = clamp01(l2 + (cb - l2) * p.saturation);
  // vibrance
  if (p.vibrance !== 0) {
    const mx = Math.max(cr, cg, cb), mn = Math.min(cr, cg, cb);
    const light = (mx + mn) * 0.5, chroma = mx - mn, den = 1 - Math.abs(2 * light - 1);
    const sat = den <= 0 ? 0 : chroma / den;
    if (sat > 0.000001) {
      const target = p.vibrance >= 0 ? sat + p.vibrance * (1 - sat) : sat * (1 + p.vibrance);
      const k = target / sat;
      cr = clamp01(light + (cr - light) * k); cg = clamp01(light + (cg - light) * k); cb = clamp01(light + (cb - light) * k);
    }
  }
  out[0] = cr; out[1] = cg; out[2] = cb;
  return out;
}

// ------------------------------------------------------------------ stats ----

/** Measured look of RGB pixels after an optional grade. */
export function lookStats(px: Pixels, p: GradeParams = NEUTRAL): LookStats {
  const n = Math.floor(px.length / 3);
  if (!n) return { luma: 0, contrast: 0, clipHi: 0, clipLo: 0, warmth: 0, tint: 0, saturation: 0 };
  const hist = new Uint32Array(256);
  let sum = 0, sumSq = 0, hi = 0, lo = 0, R = 0, G = 0, B = 0, sat = 0, satN = 0;
  const c = [0, 0, 0];
  const neutral = isNeutral(p);
  for (let i = 0; i < n; i++) {
    let r = px[i * 3] / 255, g = px[i * 3 + 1] / 255, b = px[i * 3 + 2] / 255;
    if (!neutral) { gradePixel(r, g, b, p, c); r = c[0]; g = c[1]; b = c[2]; }
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += y; sumSq += y * y; R += r; G += g; B += b;
    if (y >= 0.96) hi++;
    if (y <= 0.04) lo++;
    hist[Math.min(255, Math.round(y * 255))]++;
    // HSL saturation is meaningless near black and white (a little noise reads as "100%"), so it is
    // averaged over mid-tone pixels only.
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (l >= 0.12 && l <= 0.88) { sat += (mx - mn) / (1 - Math.abs(2 * l - 1)); satN++; }
  }
  let acc = 0, med = 0;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= n / 2) { med = i / 255; break; } }
  const mean = sum / n;
  return {
    luma: r3(med),
    contrast: r3(Math.sqrt(Math.max(0, sumSq / n - mean * mean))),
    clipHi: r3(hi / n),
    clipLo: r3(lo / n),
    warmth: r3((R - B) / n),
    tint: r3((G - (R + B) / 2) / n),
    saturation: r3(satN ? sat / satN : 0),
  };
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Every k-th pixel, so the solver stays fast; stats on the full sample are computed once at the end. */
export function subsample(px: Pixels, maxPixels = 6000): Pixels {
  const n = Math.floor(px.length / 3);
  if (n <= maxPixels) return px;
  const step = n / maxPixels;
  const out = new Uint8Array(maxPixels * 3);
  for (let i = 0; i < maxPixels; i++) { const j = Math.floor(i * step) * 3; out[i * 3] = px[j]; out[i * 3 + 1] = px[j + 1]; out[i * 3 + 2] = px[j + 2]; }
  return out;
}

// ----------------------------------------------------------------- solver ----

export type LookTarget = {
  luma: readonly [number, number];
  warmth: readonly [number, number];
  tint: readonly [number, number];
  contrast: readonly [number, number];
  saturation: readonly [number, number];
};

/** Auto Enhance: anything inside the bands is already fine. */
export const ENHANCE_TARGET: LookTarget = { luma: BANDS.luma, warmth: BANDS.warmth, tint: BANDS.tint, contrast: BANDS.contrast, saturation: BANDS.saturation };

/**
 * Match Clips: every clip toward the cut's typical look (the median of the
 * clips, pulled inside the safe bands first so nothing is matched to a bad
 * clip), with tight tolerances so the clips read as one shoot.
 */
export function matchTarget(stats: LookStats[]): LookTarget {
  const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };
  const into = (x: number, [a, b]: readonly [number, number]) => Math.min(b, Math.max(a, x));
  const around = (x: number, tol: number) => [x - tol, x + tol] as const;
  return {
    luma: around(into(med(stats.map((s) => s.luma)), BANDS.luma), 0.03),
    warmth: around(into(med(stats.map((s) => s.warmth)), BANDS.warmth), 0.015),
    tint: around(into(med(stats.map((s) => s.tint)), BANDS.tint), 0.012),
    contrast: around(into(med(stats.map((s) => s.contrast)), BANDS.contrast), 0.02),
    saturation: around(into(med(stats.map((s) => s.saturation)), BANDS.saturation), 0.04),
  };
}

/** Smallest value in [lo, hi] (searching from `from`) at which f crosses `goal`; monotone f assumed. */
function solve(f: (x: number) => number, goal: number, from: number, to: number): number {
  let a = from, b = to;
  const fa = f(a), fb = f(b);
  if ((fa - goal) * (fb - goal) > 0) return Math.abs(fb - goal) < Math.abs(fa - goal) ? b : a;
  for (let i = 0; i < 16; i++) {
    const m = (a + b) / 2;
    if ((f(m) - goal) * (fa - goal) > 0) a = m; else b = m;
  }
  // b is always on the far side of the goal: the value that achieves it.
  return b;
}

/**
 * Move a parameter only as far as needed to bring a stat into [lo, hi].
 * `stat` must rise as the parameter rises (callers negate it otherwise).
 */
function nudge(p: GradeParams, key: keyof GradeParams, stat: (q: GradeParams) => number, band: readonly [number, number]): GradeParams {
  const v = stat(p);
  if (v >= band[0] && v <= band[1]) return p;
  const goal = v < band[0] ? band[0] : band[1];
  const [lo, hi] = LIMITS[key];
  const x = solve((t) => stat({ ...p, [key]: t }), goal, p[key], v < band[0] ? hi : lo);
  return { ...p, [key]: Math.min(hi, Math.max(lo, x)) };
}

/**
 * The gentlest colorCorrection() that brings this clip's frames inside the
 * target: exposure for brightness (held back so highlights don't clip,
 * shadows lift instead), white balance, highlight recovery, shadow lift,
 * contrast for flat footage, vibrance for dull colour. Returns NEUTRAL when
 * the clip already measures well.
 */
export function solveGrade(pixels: Pixels, target: LookTarget = ENHANCE_TARGET): GradeParams {
  const px = subsample(pixels);
  const st = (q: GradeParams) => lookStats(px, q);
  let p: GradeParams = { ...NEUTRAL };
  const base = st(p);

  for (let pass = 0; pass < 2; pass++) {
    // White balance first: it changes how bright the frame reads.
    p = nudge(p, "temperature", (q) => st(q).warmth, target.warmth);
    p = nudge(p, "tint", (q) => -st(q).tint, [-target.tint[1], -target.tint[0]]);
    // Brightness, without pushing more highlights into white than the clip already had.
    const hiCap = Math.max(BANDS.clipHi, base.clipHi) + 0.01;
    const loCap = Math.max(BANDS.clipLo, base.clipLo);
    const lumaNow = st(p).luma;
    if (lumaNow < target.luma[0]) {
      // Raise exposure to the band; if that pushes bright areas to white, hold them back with
      // highlights; only if that still isn't enough, give up some of the exposure.
      let q = nudge(p, "exposure", (x) => st(x).luma, target.luma);
      if (st(q).clipHi > hiCap) q = nudge(q, "highlights", (x) => st(x).clipHi, [0, hiCap]);
      if (st(q).clipHi > hiCap) q = { ...q, exposure: solve((t) => st({ ...q, exposure: t }).clipHi, hiCap, p.exposure, q.exposure) };
      p = q;
      if (st(p).luma < target.luma[0]) p = nudge(p, "shadows", (x) => st(x).luma, target.luma);
    } else if (lumaNow > target.luma[1]) {
      p = nudge(p, "exposure", (q) => st(q).luma, target.luma);
    }
    // Bright areas near white, and crushed shadows.
    if (st(p).clipHi > BANDS.clipHi) p = nudge(p, "highlights", (q) => st(q).clipHi, [0, BANDS.clipHi]);
    if (st(p).clipLo > BANDS.clipLo) p = nudge(p, "shadows", (q) => -st(q).clipLo, [-BANDS.clipLo, 0]);
    // Contrast only on a well-exposed frame (a dark frame reads flat because
    // it is dark), and only when it doesn't crush shadows or clip highlights.
    const now = st(p);
    if (now.luma >= target.luma[0] && now.luma <= target.luma[1]) {
      const c = nudge(p, "contrast", (q) => st(q).contrast, target.contrast);
      const cs = st(c);
      if (cs.clipLo <= loCap && cs.clipHi <= hiCap && cs.luma >= target.luma[0] && cs.luma <= target.luma[1]) p = c;
    }
    // Dull or oversaturated colour; near-monochrome footage is left as it is.
    const sNow = st(p).saturation;
    if (sNow >= BANDS.monochrome && sNow < target.saturation[0]) p = nudge(p, "vibrance", (q) => st(q).saturation, target.saturation);
    else if (sNow > target.saturation[1]) p = nudge(p, "saturation", (q) => st(q).saturation, target.saturation);
  }
  return tidy(p);
}

/** Round (away from neutral, so a solved threshold is still met), and drop changes too small to see. */
function tidy(p: GradeParams): GradeParams {
  const z = (x: number, n: number, eps: number) => (Math.abs(x - n) < eps ? n : n + Math.sign(x - n) * Math.ceil(Math.abs(x - n) * 100 - 1e-9) / 100);
  return {
    exposure: z(p.exposure, 0, 0.05),
    contrast: z(p.contrast, 1, 0.02),
    shadows: z(p.shadows, 0, 0.03),
    highlights: z(p.highlights, 0, 0.03),
    temperature: z(p.temperature, 0, 0.02),
    tint: z(p.tint, 0, 0.02),
    saturation: z(p.saturation, 1, 0.02),
    vibrance: z(p.vibrance, 0, 0.02),
  };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const warmWord = (w: number) => (w < BANDS.warmth[0] ? "cool (blue)" : w > BANDS.warmth[1] ? "warm (orange)" : "neutral");

/** Plain-language reasons, from the before/after numbers only. */
export function gradeReasons(p: GradeParams, before: LookStats, after: LookStats): string[] {
  const out: string[] = [];
  const recovering = before.clipHi > BANDS.clipHi && after.clipHi < before.clipHi;
  if (p.exposure !== 0 || p.shadows > 0) {
    const held = p.highlights < 0 && !recovering ? ", bright areas held back so they don't turn white" : "";
    out.push(`Brightness ${pct(before.luma)} → ${pct(after.luma)}${p.exposure ? ` (exposure ${p.exposure > 0 ? "+" : ""}${p.exposure} stops)` : ""}${p.shadows > 0 ? ", shadows lifted" : ""}${held}.`);
    if (after.luma < BANDS.luma[0] - 0.04) out.push("Still dark: SOCIA's corrections stay gentle, so this clip may need more light when it's re-shot, or a stronger edit by hand.");
  }
  if (p.temperature !== 0 || p.tint !== 0) {
    const was = warmWord(before.warmth), is = warmWord(after.warmth);
    const tintCast = Math.abs(before.tint) > BANDS.tint[1] ? `${before.tint > 0 ? "a green" : "a magenta"} cast` : null;
    if (was === is && was !== "neutral") {
      out.push(`White balance: ${[`a ${was} cast`, tintCast].filter(Boolean).join(" and ")} reduced (fully neutral would need a stronger change than SOCIA makes).`);
    } else {
      out.push(`White balance: read ${was}${tintCast ? ` with ${tintCast}` : ""}; now ${is}.`);
    }
  }
  if (p.highlights < 0 && recovering) out.push(`Near-white areas pulled back: ${pct(before.clipHi)} of the frame → ${pct(after.clipHi)}.`);
  if (p.contrast !== 1) out.push(`${p.contrast > 1 ? "Flat" : "Harsh"} contrast evened (${Math.round(before.contrast * 100)} → ${Math.round(after.contrast * 100)}).`);
  if (p.vibrance > 0) out.push(`Dull colour lifted (saturation ${pct(before.saturation)} → ${pct(after.saturation)}).`);
  if (p.saturation < 1) out.push(after.saturation < before.saturation ? `Oversaturated colour calmed (${pct(before.saturation)} → ${pct(after.saturation)}).` : `Colour held back as the picture brightened (saturation ${pct(before.saturation)} → ${pct(after.saturation)}).`);
  return out;
}

/** The grade for one clip, or null when it already measures well. */
export function gradeClip(pixels: Pixels, target: LookTarget = ENHANCE_TARGET): ClipGrade | null {
  if (pixels.length < 300) return null;
  const params = solveGrade(pixels, target);
  if (isNeutral(params)) return null;
  const before = lookStats(pixels);
  const after = lookStats(pixels, params);
  return { params, before, after, reasons: gradeReasons(params, before, after) };
}

/** A parameter set that is finite and inside LIMITS, or null (for anything read back from storage). */
export function cleanGrade(raw: unknown): GradeParams | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const out = { ...NEUTRAL };
  for (const k of Object.keys(NEUTRAL) as (keyof GradeParams)[]) {
    const v = o[k];
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    out[k] = Math.min(LIMITS[k][1], Math.max(LIMITS[k][0], v));
  }
  return out;
}
