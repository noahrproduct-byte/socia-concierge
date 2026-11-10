// "Make it with AI", animated style: a short vertical video built in code
// (components/animated/AnimatedComposition.tsx) from a few scenes of text. The
// model writes the scenes (lib/animated/write.ts); everything here is pure, so
// the browser preview, the render and the server agree on the same video.
// Client-safe: no server imports.

export const ANIMATED_FPS = 30;
export const ANIMATED_SIZE = { width: 1080, height: 1920 } as const;

export type AnimatedTheme = "ink" | "light" | "accent";

/** The colours a person can pick, and the model may choose from. */
export const ACCENTS = ["#2F5BFF", "#FF5A4E", "#F5A623", "#18B596", "#7C5CFF", "#E5487B"] as const;

export type AnimatedScene =
  | { type: "hook"; text: string; emphasis?: string }
  | { type: "point"; text: string; emphasis?: string }
  | { type: "list"; title: string; items: string[] }
  | { type: "quote"; text: string }
  | { type: "cta"; text: string; sub?: string };

export type AnimatedSpec = {
  version: 1;
  theme: AnimatedTheme;
  accent: string;
  scenes: AnimatedScene[];
  /** Shown small at the end, e.g. the brand's name. Never invented. */
  signoff: string | null;
  caption: string;
  hashtags: string[];
};

export const MAX_SCENES = 6;
const MAX_WORDS = { hook: 9, point: 16, quote: 22, cta: 8, sub: 10, title: 8, item: 7 } as const;

const clean = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").replace(/\s*[—–]\s*/g, ", ").trim().slice(0, max) : "";
const words = (s: string) => s.split(/\s+/).filter(Boolean);
const capWords = (s: string, n: number) => words(s).slice(0, n).join(" ");

/** Every token with a digit in it, lower-cased, without trailing punctuation. */
export function numberTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.toLowerCase().split(/\s+/)) {
    const t = w.replace(/^[^\p{L}\p{N}$£€]+|[^\p{L}\p{N}%]+$/gu, "");
    if (/\d/.test(t)) out.add(t);
  }
  return out;
}

/** True when the text uses a number, price or percentage that isn't in the source. */
export function inventsNumbers(text: string, source: Set<string>): boolean {
  for (const t of numberTokens(text)) if (!source.has(t)) return true;
  return false;
}

function sceneText(s: AnimatedScene): string {
  if (s.type === "list") return [s.title, ...s.items].join(" ");
  if (s.type === "cta") return [s.text, s.sub ?? ""].join(" ");
  return s.text;
}

/**
 * The model's scenes, made safe: known types only, short lines, no em dashes,
 * no number the plan didn't contain (no invented prices, stats or results),
 * an emphasis word that is really in its line, at most MAX_SCENES, and a hook
 * first. null when there is no usable hook.
 */
export function cleanSpec(raw: unknown, sourceText: string, opts: { signoff?: string | null } = {}): AnimatedSpec | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const source = numberTokens(sourceText);
  const scenes: AnimatedScene[] = [];
  for (const s of Array.isArray(r.scenes) ? (r.scenes as Record<string, unknown>[]) : []) {
    if (!s || typeof s !== "object") continue;
    let scene: AnimatedScene | null = null;
    const emphasisIn = (text: string) => {
      const e = clean(s.emphasis, 40);
      return e && text.toLowerCase().includes(e.toLowerCase()) ? e : undefined;
    };
    if (s.type === "hook" || s.type === "point") {
      const text = capWords(clean(s.text, 160), s.type === "hook" ? MAX_WORDS.hook : MAX_WORDS.point);
      if (text) scene = { type: s.type, text, emphasis: emphasisIn(text) };
    } else if (s.type === "list") {
      const title = capWords(clean(s.title, 80), MAX_WORDS.title);
      const items = (Array.isArray(s.items) ? s.items : []).map((i) => capWords(clean(i, 80), MAX_WORDS.item)).filter(Boolean).slice(0, 4);
      if (title && items.length >= 2) scene = { type: "list", title, items };
    } else if (s.type === "quote") {
      const text = capWords(clean(s.text, 200), MAX_WORDS.quote);
      if (text) scene = { type: "quote", text };
    } else if (s.type === "cta") {
      const text = capWords(clean(s.text, 80), MAX_WORDS.cta);
      const sub = capWords(clean(s.sub, 80), MAX_WORDS.sub);
      if (text) scene = { type: "cta", text, ...(sub ? { sub } : {}) };
    }
    if (!scene || inventsNumbers(sceneText(scene), source)) continue;
    if (scene.type === "hook" && scenes.some((x) => x.type === "hook")) scene = { ...scene, type: "point" };
    scenes.push(scene);
    if (scenes.length >= MAX_SCENES) break;
  }
  const hook = scenes.findIndex((s) => s.type === "hook");
  if (hook < 0) return null;
  if (hook > 0) scenes.unshift(...scenes.splice(hook, 1));
  if (scenes.length < 2) return null;
  const theme: AnimatedTheme = r.theme === "light" || r.theme === "accent" ? r.theme : "ink";
  const accent = ACCENTS.includes(r.accent as (typeof ACCENTS)[number]) ? (r.accent as string) : ACCENTS[0];
  const caption = clean(r.caption, 2200);
  return {
    version: 1, theme, accent, scenes,
    signoff: opts.signoff ? clean(opts.signoff, 40) || null : null,
    caption: inventsNumbers(caption, source) ? "" : caption,
    hashtags: (Array.isArray(r.hashtags) ? r.hashtags : []).filter((t): t is string => typeof t === "string").map((t) => t.replace(/^#/, "").replace(/[^\p{L}\p{N}_]/gu, "").slice(0, 40)).filter(Boolean).slice(0, 5),
  };
}

/** How long a scene stays up: long enough to read it twice at a relaxed pace. */
export function sceneFrames(s: AnimatedScene): number {
  const n = words(sceneText(s)).length;
  const sec = Math.min(5.5, Math.max(2, 0.9 + n / 3));
  return Math.round(sec * ANIMATED_FPS);
}

/** Where each scene starts, and the whole length, in frames. The sign-off adds a short end card. */
export function specTimeline(spec: AnimatedSpec): { starts: number[]; frames: number[]; end: number; total: number } {
  const frames = spec.scenes.map(sceneFrames);
  const starts: number[] = [];
  let at = 0;
  for (const f of frames) { starts.push(at); at += f; }
  const end = spec.signoff ? Math.round(1.6 * ANIMATED_FPS) : 0;
  return { starts, frames, end, total: at + end };
}

/** Black or white text, whichever reads better on `hex`. */
export function inkOn(hex: string): "#111111" | "#FFFFFF" {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#FFFFFF";
  const n = parseInt(m[1], 16);
  const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.4 ? "#111111" : "#FFFFFF";
}

/** The colours for a theme: background, text, and the highlight behind the emphasis word. */
export function palette(spec: Pick<AnimatedSpec, "theme" | "accent">): { bg: string; fg: string; mark: string; markInk: string; dim: string } {
  if (spec.theme === "light") return { bg: "#F6F5F2", fg: "#141414", mark: spec.accent, markInk: inkOn(spec.accent), dim: "rgba(20,20,20,0.55)" };
  if (spec.theme === "accent") {
    const fg = inkOn(spec.accent);
    return { bg: spec.accent, fg, mark: fg, markInk: spec.accent, dim: fg === "#FFFFFF" ? "rgba(255,255,255,0.7)" : "rgba(17,17,17,0.6)" };
  }
  return { bg: "#101012", fg: "#F4F2EE", mark: spec.accent, markInk: inkOn(spec.accent), dim: "rgba(244,242,238,0.55)" };
}
