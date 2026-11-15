// How an animated video looks when the account has a video style
// (lib/videoStyle.ts): its own colours, type and stage instead of SOCIA's
// (Noah, 2026-11-14: "it keeps generating the same type of animation for all
// different accounts"). Pure and browser-safe: the server attaches the look to
// the spec, and the preview and the render draw from it.
import type { FontId, VideoStyle } from "@/lib/videoStyle";

/** Stages SOCIA can draw. A stage the account uses that isn't here falls back to its plain background. */
export const STAGES = ["climb_wall", "none"] as const;
export type StageKit = (typeof STAGES)[number];
export const CHARACTERS = ["stick", "none"] as const;
export type CharacterKit = (typeof CHARACTERS)[number];

export type AnimatedLook = {
  bg: string;
  /** The stage's own surface (a wall, a desk), a step lighter than the background. */
  surface: string;
  fg: string;
  dim: string;
  /** Results and the payoff number. */
  accent: string;
  /** The headline's second line, where the account sets its key phrase. */
  key: string;
  font: FontId;
  upper: boolean;
  stage: StageKit;
  character: CharacterKit;
};

const rgb = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)] as const;
const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
const lum = (h: string) => {
  const c = rgb(h).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

function toHsl(h: string): [number, number, number] {
  const [r, g, b] = rgb(h).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const hh = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [hh / 6, s, l];
}
function fromHsl(h: number, s: number, l: number): string {
  const f = (n: number) => { const k = (n + h * 12) % 12; const a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return hex(f(0) * 255, f(8) * 255, f(4) * 255);
}
/** A colour lifted until it reads on a dark background (frames shrink thin coloured type into muddier tones). */
const lift = (h: string, minL: number) => { const [hh, s, l] = toHsl(h); return l >= minL ? h.toUpperCase() : fromHsl(hh, Math.min(1, s * 1.15), minL); };
const darken = (h: string, maxL: number) => { const [hh, s, l] = toHsl(h); return l <= maxL ? h.toUpperCase() : fromHsl(hh, s, maxL); };
const sat = (h: string) => toHsl(h)[1];

/** The account's look for an animated video, from its saved video style. Null without one. Pure. */
export function lookFromStyle(style: VideoStyle | null | undefined): AnimatedLook | null {
  if (!style?.identity) return null;
  const id = style.identity;
  const bg = id.background.toUpperCase();
  const dark = lum(bg) < 0.25;
  // Text: the account's text colour when it reads on its background; otherwise the nearest near-white or near-black.
  const fg = contrast(id.text, bg) >= 7 ? id.text.toUpperCase() : dark ? "#F2F1EC" : "#151515";
  const accent = dark ? lift(id.accent, 0.55) : darken(id.accent, 0.42);
  // The key colour: the most saturated colour in the palette other than the background and the accent.
  const others = id.palette.filter((p) => p.toUpperCase() !== bg && p.toUpperCase() !== id.accent.toUpperCase() && sat(p) > 0.25);
  const keyRaw = others.sort((a, b) => sat(b) - sat(a))[0] ?? id.accent;
  const key = dark ? lift(keyRaw, 0.58) : darken(keyRaw, 0.4);
  const [bh, bs, bl] = toHsl(bg);
  const surface = fromHsl(bh, Math.min(1, bs + 0.1), dark ? Math.min(0.32, bl + 0.08) : Math.max(0.7, bl - 0.06));
  const words = `${id.stage} ${id.characters}`;
  return {
    bg, surface, fg, accent, key,
    dim: dark ? "rgba(242,241,236,0.58)" : "rgba(21,21,21,0.58)",
    font: id.font,
    upper: id.font === "condensed" || /all.?caps|upper.?case|capitals/i.test(id.type),
    stage: /\b(climb|boulder|bouldering|holds?|crag)\b/i.test(words) ? "climb_wall" : "none",
    character: /\bstick/i.test(id.characters) ? "stick" : "none",
  };
}

/** A look from the wire, kept only if it has every field this version draws. Pure. */
export function readLook(v: unknown): AnimatedLook | null {
  if (!v || typeof v !== "object") return null;
  const l = v as Record<string, unknown>;
  const isHex = (x: unknown) => typeof x === "string" && /^#[0-9A-F]{6}$/i.test(x);
  if (!["bg", "surface", "fg", "accent", "key"].every((k) => isHex(l[k]))) return null;
  return {
    bg: l.bg as string, surface: l.surface as string, fg: l.fg as string, accent: l.accent as string, key: l.key as string,
    dim: typeof l.dim === "string" ? l.dim.slice(0, 40) : "rgba(242,241,236,0.58)",
    font: (["sans", "condensed", "serif", "rounded", "mono", "handwritten"] as const).find((f) => f === l.font) ?? "sans",
    upper: l.upper === true,
    stage: (STAGES as readonly string[]).includes(String(l.stage)) ? (l.stage as StageKit) : "none",
    character: (CHARACTERS as readonly string[]).includes(String(l.character)) ? (l.character as CharacterKit) : "none",
  };
}
