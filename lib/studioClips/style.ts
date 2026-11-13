// Editor V2: how an edit looks and sounds beyond its cuts. The style
// (font, brand accent, text background, caption position, size and case) is
// stored on the edit and rendered identically in the preview and the export;
// a brand keeps one preset and a few named templates (brand_detail.video).
// Everything from the browser is bounded here. Pure.

export const FONTS = [
  { id: "inter", label: "Inter" },
  // Montserrat is the free match for CapCut's default "Classic" text; TikTok Sans is TikTok's own.
  { id: "montserrat", label: "Montserrat (CapCut Classic)" },
  { id: "tiktok", label: "TikTok Sans" },
  { id: "anton", label: "Anton" },
  { id: "poppins", label: "Poppins" },
  { id: "playfair", label: "Playfair Display" },
  { id: "bebas", label: "Bebas Neue" },
  // The italic serif half of a paired hook (Hook Pair's small line). Not a font a whole video is set in.
  { id: "serif", label: "Instrument Serif" },
  // Theme faces (lib/studioClips/themes): a rounded sans, a mono display face, and SOCIA's own sans.
  { id: "nunito", label: "Nunito (rounded)" },
  { id: "spacemono", label: "Space Mono" },
  { id: "instrument", label: "Instrument Sans (SOCIA)" },
] as const;
export type FontId = (typeof FONTS)[number]["id"];

/**
 * The fonts a person picks from, and all a new cut uses (Noah, 2026-11-06:
 * "CapCut fonts only"; Inter read as AI). CapCut publishes no font list, so
 * these are the bold fonts creators' guides name for it, plus TikTok's own.
 * The others stay valid only so older cuts keep their look.
 */
export const CAPCUT_FONTS = FONTS.filter((f) => f.id !== "inter" && f.id !== "playfair" && f.id !== "serif");

/** "outline": CapCut's Classic look, white text with a black outline and no box behind it. "none": white text with a soft shadow, the clean look. */
export type TextBox = "outline" | "dark" | "light" | "accent" | "none";
export type CaptionPosition = "top" | "middle" | "bottom" | "lower";
export type CaptionSize = "s" | "m" | "l";

/**
 * Caption styles, the way CapCut and the creators people copy name them. A
 * style decides how many words show at once, how the spoken word is marked
 * and how a page comes in; the person still picks font, size, position,
 * case and the highlight colour on top.
 */
export const CAPTION_STYLES = [
  { id: "classic", label: "Classic", hint: "Whole line on screen, the spoken word brightens. CapCut's default.", maxWords: 5, pageMs: 1200, animation: "none", mark: "bright" },
  { id: "karaoke", label: "Karaoke", hint: "Words fill with the highlight colour as they are spoken.", maxWords: 5, pageMs: 1200, animation: "none", mark: "fill" },
  { id: "highlight", label: "Highlight", hint: "Three words at a time, the spoken one in colour and a touch bigger. The Hormozi look.", maxWords: 3, pageMs: 900, animation: "pop", mark: "colour" },
  { id: "pop", label: "Word pop", hint: "One big word at a time, each one snapping in.", maxWords: 1, pageMs: 0, animation: "pop", mark: "none" },
  { id: "boxed", label: "Boxed", hint: "A filled box slides onto the spoken word.", maxWords: 4, pageMs: 1000, animation: "rise", mark: "box" },
  { id: "vox", label: "Vox", hint: "Lower-left, sentence case, a yellow marker sweeps under each word as it is said.", maxWords: 6, pageMs: 1600, animation: "fade", mark: "marker" },
  { id: "subtitle", label: "Subtitle", hint: "Small, calm, in a soft box. No animation.", maxWords: 7, pageMs: 1800, animation: "none", mark: "none" },
] as const;
export type CaptionStyleId = (typeof CAPTION_STYLES)[number]["id"];
/** How a caption page comes in: the style's own, or one set by a theme or the person. */
export const CAPTION_ANIMATIONS = [
  { id: "none", label: "None" },
  { id: "pop", label: "Pop" },
  { id: "rise", label: "Slide up" },
  { id: "fade", label: "Fade" },
  { id: "typewriter", label: "Typewriter" },
  { id: "bounce", label: "Scale bounce" },
] as const;
export type CaptionAnimation = (typeof CAPTION_ANIMATIONS)[number]["id"];
export const isCaptionAnimation = (v: unknown): v is CaptionAnimation => CAPTION_ANIMATIONS.some((a) => a.id === v);
export type CaptionMark = (typeof CAPTION_STYLES)[number]["mark"];
export const captionStyle = (id: CaptionStyleId) => CAPTION_STYLES.find((s) => s.id === id) ?? CAPTION_STYLES[0];

/**
 * What a caption style sets when it is picked (the person can change any of
 * it afterwards): the font and case it is known for, where it sits and
 * whether it has a box. Keeps the brand colour and the highlight.
 */
export const CAPTION_STYLE_DEFAULTS: Record<CaptionStyleId, { font: FontId; textBox: TextBox; captions: Omit<EdlStyle["captions"], "preset" | "highlight"> }> = {
  classic: { font: "montserrat", textBox: "outline", captions: { position: "bottom", size: "m", box: false, uppercase: false } },
  karaoke: { font: "montserrat", textBox: "outline", captions: { position: "bottom", size: "m", box: false, uppercase: false } },
  highlight: { font: "montserrat", textBox: "outline", captions: { position: "middle", size: "l", box: false, uppercase: true } },
  pop: { font: "anton", textBox: "outline", captions: { position: "middle", size: "l", box: false, uppercase: true } },
  boxed: { font: "poppins", textBox: "none", captions: { position: "bottom", size: "m", box: false, uppercase: false } },
  vox: { font: "inter", textBox: "none", captions: { position: "bottom", size: "m", box: false, uppercase: false } },
  subtitle: { font: "inter", textBox: "dark", captions: { position: "bottom", size: "s", box: true, uppercase: false } },
};

/** The marker and highlight colour new styles start with: CapCut's yellow. */
export const DEFAULT_HIGHLIGHT = "#ffd60a";

export type EdlStyle = {
  font: FontId;
  /** Brand colour for the call-to-action line (and text boxes set to "accent"), #rrggbb. */
  accent: string;
  textBox: TextBox;
  captions: {
    position: CaptionPosition; size: CaptionSize; box: boolean; uppercase: boolean;
    /** How the spoken word is marked and how pages come in (CAPTION_STYLES). Edits from before this existed read as "classic". */
    preset: CaptionStyleId;
    /** The colour the spoken word, its box or its marker takes, #rrggbb. */
    highlight: string;
    /** How a page comes in; absent = the caption style's own. */
    animation?: CaptionAnimation;
  };
};

/** What edits looked like before styles existed: Inter, dark boxes, captions low, the old CTA colour. */
export const DEFAULT_STYLE: EdlStyle = { font: "inter", accent: "#5b4bd6", textBox: "dark", captions: { position: "bottom", size: "m", box: true, uppercase: false, preset: "classic", highlight: DEFAULT_HIGHLIGHT } };

/** New cuts start in CapCut's Classic look (Noah, 2026-11-02): Montserrat, outlined, no boxes. A brand preset replaces it. */
export const CAPCUT_STYLE: EdlStyle = { font: "montserrat", accent: "#5b4bd6", textBox: "outline", captions: { position: "bottom", size: "m", box: false, uppercase: false, preset: "classic", highlight: DEFAULT_HIGHLIGHT } };

/** A style with a caption style applied: the style's own font, case, position and box, everything else kept. */
export function withCaptionStyle(style: EdlStyle, id: CaptionStyleId): EdlStyle {
  const d = CAPTION_STYLE_DEFAULTS[id];
  return { ...style, font: d.font, textBox: d.textBox, captions: { ...style.captions, ...d.captions, preset: id } };
}

/**
 * New cuts start in the clean look (Noah, 2026-11-11, "make the text on screen
 * look more professional", after a study of 27 successful edits in
 * docs/studio/edit-references.md): white bold type with a soft shadow and no
 * outline, captions a few words at a time just under the middle of the frame.
 * The outline look stays one click away. A brand preset replaces it.
 */
export const CLEAN_STYLE: EdlStyle = { font: "montserrat", accent: "#5b4bd6", textBox: "none", captions: { position: "lower", size: "l", box: false, uppercase: false, preset: "classic", highlight: DEFAULT_HIGHLIGHT } };

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
    font: pick(s.font, FONTS.filter((f) => f.id !== "serif").map((f) => f.id), DEFAULT_STYLE.font),
    accent: isHex(s.accent) ? s.accent.toLowerCase() : DEFAULT_STYLE.accent,
    textBox: pick<TextBox>(s.textBox, ["outline", "dark", "light", "accent", "none"], DEFAULT_STYLE.textBox),
    captions: {
      position: pick<CaptionPosition>(c.position, ["top", "middle", "lower", "bottom"], "bottom"),
      size: pick<CaptionSize>(c.size, ["s", "m", "l"], "m"),
      box: typeof c.box === "boolean" ? c.box : true,
      uppercase: typeof c.uppercase === "boolean" ? c.uppercase : false,
      preset: pick<CaptionStyleId>(c.preset, CAPTION_STYLES.map((s) => s.id), "classic"),
      highlight: isHex(c.highlight) ? c.highlight.toLowerCase() : DEFAULT_HIGHLIGHT,
      ...(isCaptionAnimation(c.animation) ? { animation: c.animation } : {}),
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
export function captionLayout(c: Pick<EdlStyle["captions"], "position" | "size">): { top: string | null; bottom: string | null; fontSize: number } {
  const fontSize = c.size === "s" ? 44 : c.size === "l" ? 66 : 54;
  if (c.position === "top") return { top: "12%", bottom: null, fontSize };
  if (c.position === "middle") return { top: "44%", bottom: null, fontSize };
  if (c.position === "lower") return { top: "52%", bottom: null, fontSize };
  return { top: null, bottom: "27%", fontSize };
}

