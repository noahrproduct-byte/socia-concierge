"use client";

// The fonts text presets draw with, loaded once into the page through the
// same @remotion/google-fonts loaders the composition uses, so the canvas
// renderer, the Remotion Player and the browser export all see the same
// faces. ensureTextFonts() resolves only when the faces are usable, so
// nothing is measured or drawn in a fallback font. Client only.
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as loadAnton } from "@remotion/google-fonts/Anton";
import type { FontId } from "./studioClips/style";
import type { TextFont } from "./textPresets";

type Loaded = { fontFamily: string; waitUntilDone: () => Promise<undefined> };

const SUBSETS = ["latin", "latin-ext"] as const;
const LOADERS: Partial<Record<FontId, () => Loaded>> = {
  inter: () => loadInter("normal", { weights: ["600", "700"], subsets: [...SUBSETS] }),
  montserrat: () => loadMontserrat("normal", { weights: ["800"], subsets: [...SUBSETS] }),
  anton: () => loadAnton("normal", { weights: ["400"], subsets: [...SUBSETS] }),
};

/** CSS family names, by font id, once loaded. */
const FAMILY: Partial<Record<FontId, string>> = { inter: "Inter", montserrat: "Montserrat", anton: "Anton" };
const loaded = new Map<FontId, Promise<string>>();

/** The CSS font-family stack for a preset font (usable before the face arrives; the browser falls back until then). */
export const fontStack = (f: TextFont): string => `"${FAMILY[f.family] ?? "Inter"}", "Helvetica Neue", Helvetica, Arial, sans-serif`;

/** A canvas font string for a preset font at a size in px. */
export const canvasFont = (f: TextFont, px: number): string => `${f.weight} ${Math.max(1, Math.round(px))}px ${fontStack(f)}`;

function load(id: FontId): Promise<string> {
  const cur = loaded.get(id);
  if (cur) return cur;
  const loader = LOADERS[id];
  const p = (async () => {
    if (!loader) return FAMILY.inter!;
    const r = loader();
    FAMILY[id] = r.fontFamily;
    await r.waitUntilDone();
    return r.fontFamily;
  })();
  loaded.set(id, p);
  return p;
}

/**
 * Loads the faces the given fonts need and waits until the browser reports
 * them ready (document.fonts.load + document.fonts.ready), so canvas text is
 * measured and drawn in the real face. Safe to call often; it is cached.
 */
export async function ensureTextFonts(fonts: TextFont[]): Promise<void> {
  if (typeof document === "undefined") return;
  const seen = new Set<string>();
  const want = fonts.filter((f) => { const k = `${f.family}/${f.weight}`; if (seen.has(k)) return false; seen.add(k); return true; });
  await Promise.all(want.map((f) => load(f.family)));
  try {
    await Promise.all(want.map((f) => document.fonts.load(canvasFont(f, 40))));
    await document.fonts.ready;
  } catch {
    // A face that fails to load falls back in the browser; the layout still fits the box.
  }
}
