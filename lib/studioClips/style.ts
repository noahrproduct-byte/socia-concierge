// Editor V2: how an edit looks and sounds beyond its cuts. The style
// (font, brand accent, text background, caption position, size and case) is
// stored on the edit and rendered identically in the preview and the export;
// a brand keeps one preset and a few named templates (brand_detail.video).
// Everything from the browser is bounded here. Pure.

export const FONTS = [
  { id: "inter", label: "Inter" },
  { id: "montserrat", label: "Montserrat" },
  { id: "poppins", label: "Poppins" },
  { id: "playfair", label: "Playfair Display" },
  { id: "bebas", label: "Bebas Neue" },
] as const;
export type FontId = (typeof FONTS)[number]["id"];

export type TextBox = "dark" | "light" | "accent" | "none";
export type CaptionPosition = "top" | "middle" | "bottom";
export type CaptionSize = "s" | "m" | "l";

export type EdlStyle = {
  font: FontId;
  /** Brand colour for the call-to-action line (and text boxes set to "accent"), #rrggbb. */
  accent: string;
  textBox: TextBox;
  captions: { position: CaptionPosition; size: CaptionSize; box: boolean; uppercase: boolean };
};

/** What edits looked like before styles existed: Inter, dark boxes, captions low, the old CTA colour. */
export const DEFAULT_STYLE: EdlStyle = { font: "inter", accent: "#5b4bd6", textBox: "dark", captions: { position: "bottom", size: "m", box: true, uppercase: false } };

export type VideoTemplate = { id: string; name: string; style: EdlStyle; width: number; height: number };
export type VideoPresets = { brand: { style: EdlStyle; width: number; height: number } | null; templates: VideoTemplate[] };

export const MAX_TEMPLATES = 6;
/** Per-clip volume: 0 (muted) to 2 (twice as loud). */
export const MAX_VOLUME = 2;

const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T => (allowed.includes(v as T) ? (v as T) : d);
const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);

/** A style from anywhere (the browser, stored JSON), bounded; undefined when it isn't one. */
export function sanitizeStyle(v: unknown): EdlStyle | undefined {
  if (!v || typeof v !== "object") return undefined;
  const s = v as Record<string, unknown>;
  const c = (s.captions && typeof s.captions === "object" ? s.captions : {}) as Record<string, unknown>;
  return {
    font: pick(s.font, FONTS.map((f) => f.id), DEFAULT_STYLE.font),
    accent: isHex(s.accent) ? s.accent.toLowerCase() : DEFAULT_STYLE.accent,
    textBox: pick<TextBox>(s.textBox, ["dark", "light", "accent", "none"], DEFAULT_STYLE.textBox),
    captions: {
      position: pick<CaptionPosition>(c.position, ["top", "middle", "bottom"], "bottom"),
      size: pick<CaptionSize>(c.size, ["s", "m", "l"], "m"),
      box: typeof c.box === "boolean" ? c.box : true,
      uppercase: typeof c.uppercase === "boolean" ? c.uppercase : false,
    },
  };
}

export function cleanVolume(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  const n = Math.round(Math.min(MAX_VOLUME, Math.max(0, v)) * 100) / 100;
  return n === 1 ? undefined : n;
}

/** Stored presets, bounded; sizes are checked by the caller against the editor's aspects. */
export function sanitizePresets(v: unknown, sizeOk: (w: number, h: number) => boolean): VideoPresets {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const b = o.brand as Record<string, unknown> | undefined;
  const brandStyle = sanitizeStyle(b?.style);
  const brand = brandStyle && sizeOk(Number(b?.width), Number(b?.height)) ? { style: brandStyle, width: Number(b!.width), height: Number(b!.height) } : null;
  const templates = (Array.isArray(o.templates) ? o.templates : []).flatMap((t) => {
    const x = t as Record<string, unknown>;
    const style = sanitizeStyle(x.style);
    const name = typeof x.name === "string" ? x.name.trim().replace(/\u2014/g, ",").slice(0, 40) : "";
    if (!style || !name || !sizeOk(Number(x.width), Number(x.height)) || typeof x.id !== "string" || !/^tpl[0-9a-z]{3,16}$/.test(x.id)) return [];
    return [{ id: x.id, name, style, width: Number(x.width), height: Number(x.height) }];
  }).slice(0, MAX_TEMPLATES);
  return { brand, templates };
}

/** Caption block placement and type size for a style (pixels at 1080 on the short side). */
export function captionLayout(c: EdlStyle["captions"]): { top: string | null; bottom: string | null; fontSize: number } {
  const fontSize = c.size === "s" ? 44 : c.size === "l" ? 66 : 54;
  if (c.position === "top") return { top: "12%", bottom: null, fontSize };
  if (c.position === "middle") return { top: "44%", bottom: null, fontSize };
  return { top: null, bottom: "27%", fontSize };
}

/** Background and text colours for a text line. The call to action always uses the brand accent. */
export function textColors(style: EdlStyle, role: "opening" | "mid" | "cta"): { bg: string | null; fg: string; shadow: string } {
  if (role === "cta" || style.textBox === "accent") return { bg: style.accent, fg: "#ffffff", shadow: "0 2px 12px rgba(0,0,0,0.35)" };
  if (style.textBox === "light") return { bg: "rgba(255,255,255,0.92)", fg: "#111111", shadow: "none" };
  if (style.textBox === "none") return { bg: null, fg: "#ffffff", shadow: "0 2px 16px rgba(0,0,0,0.75)" };
  return { bg: "rgba(0,0,0,0.46)", fg: "#ffffff", shadow: "0 2px 12px rgba(0,0,0,0.45)" };
}
