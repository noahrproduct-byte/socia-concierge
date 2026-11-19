// A 3D glass ribbon behind the speaker: a flat band wound on a tilted
// cylinder, projected with perspective, sorted by depth, shaded by how it
// faces the camera (bright rims, a see-through face), then bloomed, with
// sparkles riding its rims. It turns slowly the whole time it is up.
//
// Ported from Motus (https://github.com/kyleherbel/motus), the "Ribbon Depth"
// style's ribbon renderer (styles/ribbon-depth/src/ribbon.js and tokens.js),
// MIT licence, Copyright (c) 2026 Motus contributors; see
// THIRD_PARTY_NOTICES.md. Changed here: the colours come from the cut's
// accent, the fade toward the lower frame is drawn on the canvas, and it is a
// plain function of a time, so the Player, a scrub and the export draw the
// same frame. All coordinates are on a 1080 by 1920 frame.

export const RIBBON_W = 1080, RIBBON_H = 1920;
export type RibbonForm = "spiral" | "sweep" | "halo" | "arc";
export const RIBBON_FORMS: RibbonForm[] = ["spiral", "sweep", "halo", "arc"];
type Shape = { segments: number; turns: number; radius: number; length: number; top: number; bandWidth: number; cx: number; focal: number; cy: number; roll: number; pitch: number; phase: number; sparkles: number; strength?: number; spin?: number };
const BASE: Shape = { segments: 280, turns: 1.32, radius: 700, length: 330, top: 395, bandWidth: 108, cx: 560, focal: 1700, cy: 880, roll: -0.27, pitch: 0.5, phase: 2.2, sparkles: 110 };
const FORMS: Record<RibbonForm, Partial<Shape>> = {
  spiral: {},
  sweep: { strength: 0.62, turns: 0.32, radius: 900, length: 40, top: 700, bandWidth: 86, pitch: 0.2, roll: -0.42, phase: -1.0, cy: 880, sparkles: 70 },
  halo: { spin: 0.03, turns: 1.0, radius: 420, length: 20, top: 640, bandWidth: 58, pitch: 0.5, roll: -0.15, phase: 0.4, cy: 640, sparkles: 80 },
  arc: { turns: 0.4, radius: 980, length: 30, top: 640, bandWidth: 84, pitch: 0.36, roll: 0.0, phase: 1.9, cy: 700, sparkles: 70 },
};
const START = 0.12, REVEAL = 0.7, FLOW = 0.045, BREATH = 0.25;

type Rgb = [number, number, number];
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const inOutSine = (k: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(k));
/** A fixed number in 0..1 for a pair of whole numbers: the same on every machine and every frame. */
const noise = (i: number, j: number) => { const x = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return x - Math.floor(x); };
const rgb = (hex: string): Rgb => { const h = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#ff7d22"; return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb; };
const mix = (a: Rgb, b: Rgb, k: number): Rgb => a.map((v, i) => Math.round(v + (b[i] - v) * k)) as Rgb;
const css = (c: Rgb, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Layer = { c: HTMLCanvasElement | OffscreenCanvas; x: Ctx };
export type RibbonScratch = { buf: Layer; b1: Layer; b2: Layer; b3: Layer; w: number; h: number };
const layer = (w: number, h: number): Layer | null => {
  const c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
  const x = c.getContext("2d") as Ctx | null;
  return x ? { c, x } : null;
};
/** The working canvases for one ribbon at a canvas size; made once and reused every frame. */
export function ribbonScratch(w: number, h: number): RibbonScratch | null {
  const buf = layer(w, h), b1 = layer(Math.ceil(w / 6), Math.ceil(h / 6)), b2 = layer(Math.ceil(w / 14), Math.ceil(h / 14)), b3 = layer(Math.ceil(w / 32), Math.ceil(h / 32));
  return buf && b1 && b2 && b3 ? { buf, b1, b2, b3, w, h } : null;
}

/**
 * Draw the ribbon as it is `t` seconds after it came on. `leave` is 0..1, how far it has un-drawn itself
 * on the way out. The canvas may be any size with the frame's shape; it is cleared first.
 */
export function drawRibbon(g: Ctx, sc: RibbonScratch, t: number, opts: { form: RibbonForm; accent: string; strength?: number; leave?: number }): void {
  const { w, h } = sc, k = w / RIBBON_W;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
  g.clearRect(0, 0, w, h);
  const R = { ...BASE, ...FORMS[opts.form] };
  const strength = (opts.strength ?? 1) * (R.strength ?? 1);
  const reveal = Math.min(inOutSine((t - START) / REVEAL), inOutSine(1 - (opts.leave ?? 0)));
  if (reveal <= 0 || strength <= 0) return;
  const A = rgb(opts.accent), A2 = mix(A, [255, 255, 255], 0.38), RIM: Rgb = mix(A, [255, 255, 255], 0.88), DEEP = mix(A, [0, 0, 0], 0.78);

  const b = sc.buf.x;
  b.setTransform(1, 0, 0, 1, 0, 0); b.globalCompositeOperation = "source-over"; b.globalAlpha = 1;
  b.clearRect(0, 0, w, h);
  b.setTransform(k, 0, 0, k, 0, 0);
  const N = R.segments, S = 8, M = S / 2;
  const phase = R.phase + (R.turns >= 1 ? t * (R.spin ?? FLOW) * Math.PI * 2 : Math.sin(t * 0.35) * 0.1);
  const shine = ((t * 0.22) % 1.4) - 0.2;
  const radius = R.radius * (1 + 0.018 * Math.sin(t * BREATH * Math.PI * 2));
  const cp = Math.cos(R.pitch), sp = Math.sin(R.pitch), cr = Math.cos(R.roll), sr = Math.sin(R.roll);
  const project = (u: number, v: number) => {
    const th = phase + u * R.turns * Math.PI * 2;
    const X = radius * Math.sin(th), Y0 = R.top + u * R.length - R.cy + v * R.bandWidth, Z0 = -radius * Math.cos(th);
    const Y1 = Y0 * cp - Z0 * sp, Z1 = Y0 * sp + Z0 * cp;
    const X2 = X * cr - Y1 * sr, Y2 = X * sr + Y1 * cr;
    const s = R.focal / (R.focal + Z1);
    return { x: R.cx + X2 * s, y: R.cy + Y2 * s, z: Z1, s, face: Math.abs(-Math.cos(th) * cp) };
  };
  const cols: ReturnType<typeof project>[][] = [];
  for (let i = 0; i <= N; i++) { const col = []; for (let q = 0; q <= S; q++) col.push(project(i / N, q / S - 0.5)); cols.push(col); }
  const segs: number[] = [];
  for (let i = 0; i < N; i++) { if (i / N > reveal) break; segs.push(i); }
  segs.sort((p, q) => (cols[q][M].z + cols[q + 1][M].z) - (cols[p][M].z + cols[p + 1][M].z));
  b.lineJoin = "round";
  for (const i of segs) {
    const c0 = cols[i], c1 = cols[i + 1], u = i / N;
    const fres = 1 - c0[M].face;
    const near = clamp((c0[M].s - 0.75) / 0.9);
    const tip = (reveal < 1 ? clamp(1 - (reveal - u) / 0.06) : 0) + 0.55 * Math.exp(-Math.pow((u - shine) / 0.045, 2));
    const alphaBase = strength * Math.min(clamp(u / 0.08), clamp((1 - u) / 0.14));
    for (let q = 0; q < S; q++) {
      const vv = Math.abs((q + 0.5) / S - 0.5) * 2;
      const col = mix(mix(mix(DEEP, A, 0.62 + 0.38 * near), A2, clamp(0.55 * fres + 0.5 * vv * vv + 0.15)), RIM, clamp(Math.pow(vv, 5) * 0.8 + fres * fres * 0.4 + tip * 0.7));
      b.fillStyle = css(col, alphaBase * clamp(0.16 + 0.22 * near + 0.36 * fres * fres + 0.5 * Math.pow(vv, 6) + tip * 0.5));
      b.beginPath(); b.moveTo(c0[q].x, c0[q].y); b.lineTo(c1[q].x, c1[q].y); b.lineTo(c1[q + 1].x, c1[q + 1].y); b.lineTo(c0[q + 1].x, c0[q + 1].y); b.closePath(); b.fill();
    }
    for (let q = 0; q <= S; q++) {
      const rim = q === 0 || q === S, spec = q === 2;
      if (!rim && !spec && q % 2) continue;
      const a = rim ? clamp(0.62 + 0.38 * fres + 0.15 * near) : spec ? 0.28 + 0.42 * fres : 0.07 + 0.1 * fres;
      b.strokeStyle = css(rim || spec ? RIM : A2, alphaBase * a);
      b.lineWidth = (rim ? 2.6 : spec ? 1.6 : 0.9) * c0[q].s;
      b.beginPath(); b.moveTo(c0[q].x, c0[q].y); b.lineTo(c1[q].x, c1[q].y); b.stroke();
    }
  }
  // Bloom by scaling down and up again: a wide warm halo, a tighter glow, then the sharp band on top.
  for (const L of [sc.b1, sc.b2, sc.b3]) { L.x.setTransform(1, 0, 0, 1, 0, 0); L.x.clearRect(0, 0, L.c.width, L.c.height); L.x.imageSmoothingEnabled = true; }
  sc.b1.x.drawImage(sc.buf.c as CanvasImageSource, 0, 0, sc.b1.c.width, sc.b1.c.height);
  sc.b2.x.drawImage(sc.b1.c as CanvasImageSource, 0, 0, sc.b2.c.width, sc.b2.c.height);
  sc.b3.x.drawImage(sc.b2.c as CanvasImageSource, 0, 0, sc.b3.c.width, sc.b3.c.height);
  g.imageSmoothingEnabled = true; g.globalCompositeOperation = "lighter";
  g.globalAlpha = 0.8; g.drawImage(sc.b3.c as CanvasImageSource, 0, 0, w, h);
  g.globalAlpha = 0.85; g.drawImage(sc.b2.c as CanvasImageSource, 0, 0, w, h);
  g.globalAlpha = 0.55; g.drawImage(sc.b1.c as CanvasImageSource, 0, 0, w, h);
  g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; g.drawImage(sc.buf.c as CanvasImageSource, 0, 0);
  // Sparkles ride the rims and twinkle on fixed numbers, never on the clock.
  g.setTransform(k, 0, 0, k, 0, 0); g.globalCompositeOperation = "lighter";
  for (let i = 0; i < R.sparkles; i++) {
    const u = noise(i, 1), edge = noise(i, 2) < 0.5 ? 0 : S;
    if (u > reveal) continue;
    const p = cols[Math.min(N, Math.floor(u * N))][edge];
    const off = (noise(i, 3) - 0.5) * 40 * p.s, tw = 0.5 + 0.5 * Math.sin(t * (1.4 + noise(i, 4) * 2.2) * Math.PI * 2 + i);
    const r = (0.8 + noise(i, 5) * 1.8) * p.s, a = strength * tw * (0.35 + 0.5 * (1 - p.face));
    g.fillStyle = css(RIM, a); g.beginPath(); g.arc(p.x + off * 0.3, p.y + off, r, 0, Math.PI * 2); g.fill();
    if (noise(i, 6) > 0.86) { g.fillStyle = css(RIM, a * 0.7); g.fillRect(p.x - r * 6, p.y + off - 0.6, r * 12, 1.2); g.fillRect(p.x - 0.6, p.y + off - r * 6, 1.2, r * 12); }
  }
  // The ribbon lives behind the head and shoulders: it fades out toward the lower frame, above hands and microphones.
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = "destination-out";
  const from = Math.round(h * 0.57), to = Math.round(h * 0.67);
  for (let y = from; y < h; y += 2) { g.globalAlpha = clamp((y - from) / Math.max(1, to - from)); g.fillStyle = "#000"; g.fillRect(0, y, w, 2); }
  g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
}
