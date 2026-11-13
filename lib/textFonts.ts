"use client";

// The fonts text presets draw with, loaded once into the page from the
// site's own files (lib/editorFonts.ts), the same faces the composition
// uses, so the canvas renderer, the Remotion Player and the browser export
// all see the same glyphs. ensureTextFonts() resolves only when the faces
// are usable, so nothing is measured or drawn in a fallback font. Client only.
import type { TextFont } from "./textPresets";
import { familyOf, loadEditorFont } from "./editorFonts";

/** The CSS font-family stack for a preset font (usable before the face arrives; the browser falls back until then). */
export const fontStack = (f: TextFont): string => (f.family === "serif"
  ? `"${familyOf("serif")}", Georgia, "Times New Roman", serif`
  : f.family === "spacemono"
    ? `"${familyOf("spacemono")}", Menlo, Consolas, monospace`
    : `"${familyOf(f.family)}", "Helvetica Neue", Helvetica, Arial, sans-serif`);

/** A canvas font string for a preset font at a size in px. */
export const canvasFont = (f: TextFont, px: number): string => `${f.italic ? "italic " : ""}${f.weight} ${Math.max(1, Math.round(px))}px ${fontStack(f)}`;

/**
 * Loads the faces the given fonts need and waits until the browser reports
 * them ready (document.fonts.load + document.fonts.ready), so canvas text is
 * measured and drawn in the real face. Safe to call often; it is cached.
 */
export async function ensureTextFonts(fonts: TextFont[]): Promise<void> {
  if (typeof document === "undefined") return;
  const seen = new Set<string>();
  const want = fonts.filter((f) => { const k = `${f.family}/${f.weight}/${f.italic ? "i" : ""}`; if (seen.has(k)) return false; seen.add(k); return true; });
  await Promise.all(want.map((f) => loadEditorFont(f.family)));
  try {
    await Promise.all(want.map((f) => document.fonts.load(canvasFont(f, 40))));
    await document.fonts.ready;
  } catch {
    // A face that fails to load falls back in the browser; the layout still fits the box.
  }
}
