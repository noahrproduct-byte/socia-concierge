// The drawings a picture scene carries (lib/studioClips/scenes.ts, kind
// "picture"): what is being talked about, drawn on screen. Two kinds:
//   map   a country's outline (lib/studioClips/countryMap.ts looks it up on
//         the server and the outline travels with the scene);
//   draw  a flat drawing of a thing (a warehouse, a truck, a phone) made of a
//         few shapes on a 100 by 100 grid, written by the model that reads
//         the words (lib/studioClips/visualsModel.ts).
// Everything here is bounded and checked: a shape is only ever a path of
// numbers and path letters in one of five tones, so nothing a model or a
// stored cut sends can carry markup. Pure.

export const ART_TONES = ["accent", "light", "mid", "dark", "none"] as const;
export type ArtTone = (typeof ART_TONES)[number];
export type ArtShape = { d: string; fill: ArtTone; stroke: ArtTone; w?: number };
export type SceneArt =
  | { kind: "map"; name: string; d: string; /** a point inside the country, where the pin lands */ c: [number, number] }
  | { kind: "draw"; name: string; shapes: ArtShape[] };

export const ART_MAX = 3;
export const ART_SHAPES_MAX = 16;
export const ART_PATH_MAX = 900;
export const MAP_PATH_MAX = 4200;
const PATH = /^[MmLlHhVvCcSsQqTtAaZz0-9\s,.\-]+$/;
const tone = (v: unknown, fallback: ArtTone): ArtTone => (ART_TONES as readonly unknown[]).includes(v) ? (v as ArtTone) : fallback;
const name = (v: unknown) => (typeof v === "string" ? v.replace(/[^\p{L}\p{N} '.-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 40) : "");
const okPath = (v: unknown, max: number): v is string => typeof v === "string" && v.length >= 5 && v.length <= max && PATH.test(v) && /^[Mm]/.test(v.trim());
const num = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v * 10) / 10)) : fallback);

/** The drawings of a picture scene from anywhere (a model, stored JSON), bounded; empty when none is usable. */
export function sanitizeArt(v: unknown): SceneArt[] {
  if (!Array.isArray(v)) return [];
  const out: SceneArt[] = [];
  for (const raw of v.slice(0, 8)) {
    if (!raw || typeof raw !== "object" || out.length >= ART_MAX) continue;
    const o = raw as Record<string, unknown>;
    if (o.kind === "map") {
      const c = Array.isArray(o.c) ? o.c : [];
      if (okPath(o.d, MAP_PATH_MAX)) out.push({ kind: "map", name: name(o.name), d: o.d, c: [num(c[0], 0, 100, 50), num(c[1], 0, 100, 50)] });
    } else if (o.kind === "draw") {
      const shapes: ArtShape[] = [];
      for (const s of Array.isArray(o.shapes) ? o.shapes.slice(0, 40) : []) {
        const r = s as Record<string, unknown> | null;
        if (!r || !okPath(r.d, ART_PATH_MAX) || shapes.length >= ART_SHAPES_MAX) continue;
        const fill = tone(r.fill, "none"), stroke = tone(r.stroke, fill === "none" ? "light" : "none");
        if (fill === "none" && stroke === "none") continue;
        shapes.push({ d: r.d, fill, stroke, ...(stroke !== "none" ? { w: num(r.w, 1, 8, 3) } : {}) });
      }
      if (shapes.length) out.push({ kind: "draw", name: name(o.name), shapes });
    }
  }
  return out;
}
