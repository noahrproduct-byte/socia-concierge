import { describe, it, expect } from "vitest";
import { BANDS, ENHANCE_TARGET, LIMITS, NEUTRAL, cleanGrade, gradeClip, gradePixel, lookStats, matchTarget, solveGrade } from "./grade";

/** A deterministic "frame": pixels spread around a base colour, with a share pushed to white. */
function frame(base: [number, number, number], { spread = 40, white = 0, n = 20000 } = {}): Uint8Array {
  const px = new Uint8Array(n * 3);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const w = rnd() < white;
    const d = (rnd() - 0.5) * 2 * spread;
    for (let c = 0; c < 3; c++) px[i * 3 + c] = w ? 255 : Math.max(0, Math.min(255, Math.round(base[c] + d + (rnd() - 0.5) * 10)));
  }
  return px;
}

const within = (x: number, [a, b]: readonly [number, number], tol = 0.012) => x >= a - tol && x <= b + tol;

describe("the shader copy", () => {
  it("leaves pixels alone when neutral and matches exposure math", () => {
    expect(gradePixel(0.3, 0.5, 0.7, NEUTRAL)).toEqual([0.3, 0.5, 0.7]);
    // +1 stop doubles linear light: sRGB 0.5 (0.214 linear) -> 0.428 linear -> 0.686 sRGB
    const [r] = gradePixel(0.5, 0.5, 0.5, { ...NEUTRAL, exposure: 1 });
    expect(r).toBeCloseTo(0.686, 2);
  });

  it("warms with positive temperature without changing luminance much", () => {
    const [r, , b] = gradePixel(0.5, 0.5, 0.5, { ...NEUTRAL, temperature: 0.3 });
    expect(r).toBeGreaterThan(0.5);
    expect(b).toBeLessThan(0.5);
  });
});

describe("Auto Enhance", () => {
  it("brightens a dark clip into the band without clipping it", () => {
    const px = frame([72, 68, 64], { spread: 50 });
    const g = gradeClip(px)!;
    expect(g.params.exposure).toBeGreaterThan(0);
    expect(g.params.exposure).toBeLessThanOrEqual(LIMITS.exposure[1]);
    expect(g.before.luma).toBeLessThan(BANDS.luma[0]);
    expect(within(g.after.luma, BANDS.luma, 0.03)).toBe(true);
    expect(g.after.clipHi).toBeLessThanOrEqual(BANDS.clipHi + 0.01);
    expect(g.after.clipLo).toBeLessThanOrEqual(Math.max(g.before.clipLo, BANDS.clipLo));
    expect(g.reasons[0]).toMatch(/^Brightness \d+% → \d+%/);
  });

  it("neutralises a mild blue cast", () => {
    const px = frame([118, 126, 142], { spread: 50 });
    const g = gradeClip(px)!;
    expect(g.params.temperature).toBeGreaterThan(0);
    expect(within(g.after.warmth, BANDS.warmth)).toBe(true);
    expect(g.reasons.join(" ")).toMatch(/read cool \(blue\).*now neutral/);
  });

  it("reduces a strong blue cast and says it only reduced it", () => {
    const px = frame([110, 128, 165], { spread: 50 });
    const g = gradeClip(px)!;
    expect(g.params.temperature).toBe(LIMITS.temperature[1]);
    expect(g.after.warmth - g.before.warmth).toBeGreaterThan(0.04);
    expect(g.reasons.join(" ")).toMatch(/a cool \(blue\) cast.* reduced/);
  });

  it("pulls back near-white areas", () => {
    const px = frame([150, 150, 150], { white: 0.12 });
    const g = gradeClip(px)!;
    expect(g.params.highlights).toBeLessThan(0);
    expect(g.after.clipHi).toBeLessThan(g.before.clipHi);
  });

  it("leaves a well-exposed, neutral clip untouched", () => {
    expect(gradeClip(frame([130, 118, 100], { spread: 70 }))).toBeNull();
  });

  it("leaves near-monochrome footage's colour alone", () => {
    const g = gradeClip(frame([150, 150, 150], { white: 0.12 }));
    expect(g?.params.vibrance ?? 0).toBe(0);
  });

  it("never goes past the limits on hopeless footage", () => {
    const p = solveGrade(frame([8, 8, 10], { spread: 6 }), ENHANCE_TARGET);
    for (const k of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
      expect(p[k]).toBeGreaterThanOrEqual(LIMITS[k][0]);
      expect(p[k]).toBeLessThanOrEqual(LIMITS[k][1]);
    }
  });
});

describe("Match Clips", () => {
  it("brings two acceptable but different clips to the same look", () => {
    const a = frame([105, 100, 95], { spread: 60 });
    const b = frame([150, 145, 138], { spread: 60 });
    const target = matchTarget([lookStats(a), lookStats(b)]);
    const ga = gradeClip(a, target), gb = gradeClip(b, target);
    const la = ga ? ga.after.luma : lookStats(a).luma;
    const lb = gb ? gb.after.luma : lookStats(b).luma;
    expect(Math.abs(la - lb)).toBeLessThan(0.08);
    expect(Math.abs(lookStats(a).luma - lookStats(b).luma)).toBeGreaterThan(0.12);
  });
});

describe("stored grades", () => {
  it("clamps into the limits and rejects junk", () => {
    expect(cleanGrade({ ...NEUTRAL, exposure: 3 })?.exposure).toBe(LIMITS.exposure[1]);
    expect(cleanGrade({ ...NEUTRAL, tint: Number.NaN })).toBeNull();
    expect(cleanGrade("x")).toBeNull();
  });
});
