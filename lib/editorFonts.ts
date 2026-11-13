"use client";

// The editor's faces, served from the site (public/fonts/editor, fetched by
// scripts/fetch-editor-fonts.mjs, SIL Open Font License) and registered with
// the FontFace API, so the canvas text renderer, the Remotion Player and the
// browser export all draw the same files and never wait on Google Fonts.
// Client only; safe to call often (cached).
import manifest from "@/public/fonts/editor/manifest.json";
import type { FontId } from "./studioClips/style";

type Face = { id: string; family: string; weight: number; style: "normal" | "italic"; file: string };
const FACES = manifest as Face[];

/** The CSS family name of a font id (the file's own name, so a fallback never masquerades as it). */
export function familyOf(id: FontId): string {
  return FACES.find((f) => f.id === id)?.family ?? "Montserrat";
}

const loading = new Map<string, Promise<void>>();

/** Register (once) every face of a font id with the document and wait until they are usable. */
export function loadEditorFont(id: FontId): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  const cur = loading.get(id);
  if (cur) return cur;
  const faces = FACES.filter((f) => f.id === id);
  const p = Promise.all(faces.map(async (f) => {
    const already = Array.from(document.fonts).find((x) => x.family === f.family && x.weight === String(f.weight) && x.style === f.style);
    if (already) { await already.load().catch(() => null); return; }
    const face = new FontFace(f.family, `url(/fonts/editor/${f.file}) format("woff2")`, { weight: String(f.weight), style: f.style, display: "swap" });
    try { await face.load(); document.fonts.add(face); } catch { /* the browser falls back; the layout still fits its box */ }
  })).then(() => undefined);
  loading.set(id, p);
  return p;
}

/** Every face at once (the theme picker's thumbnails need them all). */
export const loadAllEditorFonts = (): Promise<void> => Promise.all(Array.from(new Set(FACES.map((f) => f.id as FontId))).map(loadEditorFont)).then(() => undefined);
