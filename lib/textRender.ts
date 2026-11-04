// One renderer for on-screen text: a preset, the words, the frame size → a
// transparent PNG the size of the frame. The Remotion composition draws that
// PNG in the Player and in the browser export, the Rate preview lays it over
// the <video>, and the preset picker shows it as a thumbnail, so what is seen
// is always what is made. Layout (wrapping, shrinking to fit, position in the
// safe zone) is pure and tested; only drawTextLayer() touches a canvas.
import { canvasFont, ensureTextFonts } from "./textFonts";
import { TEXT_PRESETS, frameScale, safeZoneFor, type SafeZone, type TextFont, type TextPreset, type TextSlot } from "./textPresets";

/** Width of a string in a canvas font; the tests pass a fake, the renderer a 2D context. */
export type Measure = (text: string, font: string) => number;

export type LaidLine = { text: string; width: number; font: string; fontSize: number; lineHeight: number; color: string; broke?: boolean };

export type TextLayout = {
  fits: boolean;
  /** Why it doesn't fit: too many lines or too tall for the zone even at the smallest size, or nothing to draw. */
  reason: "ok" | "too_long" | "empty";
  frame: { width: number; height: number };
  zone: SafeZone;
  scale: number;
  /** The box the text sits in (the filled bar, or the text's own extent), in frame px. */
  box: { x: number; y: number; width: number; height: number };
  pad: { x: number; y: number };
  lines: LaidLine[];
  /** Main type size used, frame px. */
  fontSize: number;
  align: "center" | "left";
  rtl: boolean;
};

export type LayoutArgs = { preset: TextPreset; text: string; slot?: TextSlot | null; width: number; height: number; measure: Measure };

const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
/** Hebrew, Arabic and the scripts written right to left: the line is laid out that way. */
export const isRtl = (s: string): boolean => RTL.test(s);

/** Explicit line breaks stay; runs of other whitespace collapse; nothing leads or trails. */
export function normalizeText(s: string): string[] {
  const paras = s.replace(/\r\n?/g, "\n").split("\n").map((p) => p.replace(/[ \t\f\v]+/g, " ").trim());
  while (paras.length && !paras[0]) paras.shift();
  while (paras.length && !paras[paras.length - 1]) paras.pop();
  return paras;
}

const graphemes = (s: string): string[] => {
  const Seg = (Intl as unknown as { Segmenter?: new (locale: string, o: { granularity: string }) => { segment: (s: string) => Iterable<{ segment: string }> } }).Segmenter;
  if (Seg) return Array.from(new Seg("en", { granularity: "grapheme" }).segment(s), (x) => x.segment);
  return Array.from(s);
};

export type WrappedLine = { text: string; width: number; /** this line came from breaking a word that was wider than the box */ broke?: boolean };

/** Greedy word wrap; a word wider than the line is broken at characters so nothing ever sticks out. */
export function wrapParagraph(text: string, maxWidth: number, font: string, measure: Measure): WrappedLine[] {
  const out: WrappedLine[] = [];
  const pushChunks = (word: string) => {
    let cur = "";
    for (const g of graphemes(word)) {
      const next = cur + g;
      if (cur && measure(next, font) > maxWidth) { out.push({ text: cur, width: measure(cur, font), broke: true }); cur = g; } else cur = next;
    }
    if (cur) out.push({ text: cur, width: measure(cur, font), broke: true });
  };
  let line = "";
  for (const word of text.split(" ")) {
    if (!word) continue;
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate, font) <= maxWidth) { line = candidate; continue; }
    if (line) { out.push({ text: line, width: measure(line, font) }); line = ""; }
    if (measure(word, font) <= maxWidth) { line = word; continue; }
    pushChunks(word);
    // The last chunk may take more words after it.
    const last = out.pop();
    if (last) line = last.text;
  }
  if (line) out.push({ text: line, width: measure(line, font) });
  return out;
}

function wrapAt(paras: string[], font: TextFont, px: number, maxWidth: number, measure: Measure, color: string, lineHeight: number): LaidLine[] {
  const f = canvasFont(font, px);
  return paras.flatMap((p) => (p ? wrapParagraph(p, maxWidth, f, measure) : [{ text: "", width: 0 }]).map((l) => ({ ...l, font: f, fontSize: px, lineHeight, color })));
}

/**
 * Where the words go and how big. The type shrinks from the preset's largest
 * size to its smallest until the lines fit the box's width and the preset's
 * line limit; the box then sits in the chosen slot of the safe zone. Never
 * outside the zone: when it can't fit, `fits` is false and nothing should be
 * drawn or exported.
 */
export function layoutTextLayer({ preset, text, slot, width, height, measure }: LayoutArgs): TextLayout {
  const scale = frameScale(width, height);
  const zone = safeZoneFor(width, height);
  const pad = { x: Math.round(preset.box.padding.x * scale), y: Math.round(preset.box.padding.y * scale) };
  const barW = preset.box.accentBar ? Math.round(10 * scale) : 0, barGap = preset.box.accentBar ? Math.round(18 * scale) : 0;
  const boxW = Math.round(zone.width * preset.widthPct);
  const innerW = Math.max(1, boxW - pad.x * 2 - barW - barGap);
  const base: Omit<TextLayout, "fits" | "reason" | "box" | "lines" | "fontSize"> = { frame: { width, height }, zone, scale, pad, align: preset.align, rtl: isRtl(text) };
  const empty = (): TextLayout => ({ ...base, fits: false, reason: "empty", box: { x: zone.x, y: zone.y, width: boxW, height: 0 }, lines: [], fontSize: 0 });
  const raw = normalizeText(preset.uppercase ? text.toUpperCase() : text);
  if (!raw.some(Boolean)) return empty();

  const lead = preset.lead ? raw[0] : null;
  const body = preset.lead ? raw.slice(1) : raw;
  const bodyMax = preset.lead ? Math.max(1, preset.maxLines - 1) : preset.maxLines;

  // The lead (Big Stat's number) is one line; it shrinks on its own.
  let leadLine: LaidLine | null = null;
  if (lead) {
    const l = preset.lead!;
    for (let s = l.size.max; s >= l.size.min; s -= 2) {
      const f = canvasFont(l.font, s * scale);
      const w = measure(lead, f);
      leadLine = { text: lead, width: w, font: f, fontSize: s * scale, lineHeight: 1.0, color: l.color };
      if (w <= innerW) break;
    }
    if (leadLine && leadLine.width > innerW) return { ...empty(), reason: "too_long" };
  }

  let lines: LaidLine[] | null = null;
  let fontSize = preset.size.min * scale;
  if (body.length) {
    // Shrink before breaking a word: a broken word is accepted only at the smallest size.
    for (let s = preset.size.max; s >= preset.size.min; s -= 2) {
      const px = s * scale;
      const ls = wrapAt(body, preset.font, px, innerW, measure, preset.color, preset.lineHeight);
      const broke = ls.some((l) => l.broke);
      if (ls.length <= bodyMax && ls.every((l) => l.width <= innerW) && (!broke || s - 2 < preset.size.min)) { lines = ls; fontSize = px; break; }
    }
    if (!lines) return { ...empty(), reason: "too_long" };
  } else lines = [];
  if (leadLine) lines = [leadLine, ...lines];
  if (!lines.length) return empty();

  const leadGap = leadLine && lines.length > 1 ? Math.round(preset.lead!.gap * scale) : 0;
  const textH = lines.reduce((a, l) => a + l.fontSize * l.lineHeight, 0) + leadGap;
  const widest = Math.max(...lines.map((l) => l.width));
  const bw = preset.box.fullWidth ? boxW : Math.min(boxW, Math.ceil(widest) + pad.x * 2 + barW + barGap);
  const bh = Math.ceil(textH + pad.y * 2);
  if (bh > zone.height) return { ...empty(), reason: "too_long" };
  const x = preset.align === "left" ? zone.x : Math.round(zone.x + (zone.width - bw) / 2);
  const s = slot ?? preset.slot;
  const y = s === "top" ? zone.y : s === "middle" ? Math.round(zone.y + (zone.height - bh) / 2) : zone.y + zone.height - bh;
  return { ...base, fits: true, reason: "ok", box: { x, y, width: bw, height: bh }, lines, fontSize };
}

/** A person-readable reason a line doesn't fit its preset. */
export function fitMessage(preset: TextPreset, layout: TextLayout): string | null {
  if (layout.fits || layout.reason === "empty") return null;
  return `Too long for ${preset.label}. Try ${preset.maxChars} characters or fewer, in ${preset.maxLines === 1 ? "one line" : `${preset.maxLines} lines`} at most.`;
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const roundRect = (ctx: Ctx, x: number, y: number, w: number, h: number, r: number) => {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
};

/** Draws a laid-out layer onto a context whose canvas is the frame's size. */
export function drawTextLayer(ctx: Ctx, preset: TextPreset, layout: TextLayout): void {
  if (!layout.fits) return;
  const { box, pad, scale, lines } = layout;
  const b = preset.box;
  ctx.save();
  if (b.kind === "fill" && b.fill) {
    ctx.save();
    if (b.shadow) { ctx.shadowColor = b.shadow.color; ctx.shadowBlur = b.shadow.blur * scale; ctx.shadowOffsetY = b.shadow.offsetY * scale; }
    ctx.fillStyle = b.fill;
    roundRect(ctx, box.x, box.y, box.width, box.height, b.radius * scale);
    ctx.fill();
    ctx.restore();
  }
  const barW = b.accentBar ? Math.round(10 * scale) : 0, barGap = b.accentBar ? Math.round(18 * scale) : 0;
  if (b.accentBar) {
    ctx.fillStyle = b.accentBar;
    const inset = Math.round(pad.y * 0.6);
    roundRect(ctx, layout.rtl ? box.x + box.width - pad.x - barW : box.x + pad.x, box.y + inset, barW, box.height - inset * 2, barW / 2);
    ctx.fill();
  }
  ctx.textBaseline = "alphabetic";
  const lsp = (ctx as unknown as { letterSpacing?: string });
  const leadGap = preset.lead && lines.length > 1 ? Math.round(preset.lead.gap * scale) : 0;
  let y = box.y + pad.y;
  lines.forEach((l, i) => {
    const lh = l.fontSize * l.lineHeight;
    // Baseline a little above the line's bottom, so descenders sit inside the line box.
    const baseline = y + lh - (lh - l.fontSize) / 2 - l.fontSize * 0.2;
    ctx.font = l.font;
    if ("letterSpacing" in ctx) lsp.letterSpacing = `${preset.letterSpacing * l.fontSize}px`;
    ctx.direction = layout.rtl ? "rtl" : "ltr";
    let x: number;
    if (layout.align === "left") {
      ctx.textAlign = layout.rtl ? "right" : "left";
      x = layout.rtl ? box.x + box.width - pad.x - barW - barGap : box.x + pad.x + barW + barGap;
    } else { ctx.textAlign = "center"; x = box.x + box.width / 2; }
    if (l.text) {
      if (b.kind === "outline" && b.strokeRatio) {
        ctx.save();
        if (b.shadow) { ctx.shadowColor = b.shadow.color; ctx.shadowBlur = b.shadow.blur * scale; ctx.shadowOffsetY = b.shadow.offsetY * scale; }
        ctx.lineJoin = "round"; ctx.miterLimit = 2;
        ctx.strokeStyle = b.strokeColor ?? "#000";
        ctx.lineWidth = Math.max(2, l.fontSize * b.strokeRatio * 2);
        ctx.strokeText(l.text, x, baseline);
        ctx.restore();
      } else if (b.kind === "shadow" && b.shadow) {
        ctx.shadowColor = b.shadow.color; ctx.shadowBlur = b.shadow.blur * scale; ctx.shadowOffsetY = b.shadow.offsetY * scale;
      }
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, x, baseline);
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    }
    y += lh + (i === 0 ? leadGap : 0);
  });
  ctx.restore();
}

export type RenderArgs = { presetId: TextPreset["id"]; text: string; slot?: TextSlot | null; width: number; height: number };
export type RenderedText = { url: string; width: number; height: number; layout: TextLayout };

const cache = new Map<string, Promise<RenderedText>>();
const CACHE_MAX = 48;
export const renderKey = (a: RenderArgs): string => JSON.stringify([a.presetId, a.text, a.slot ?? null, a.width, a.height]);

let measureCtx: CanvasRenderingContext2D | null = null;
/** Text widths from a shared 2D context, for live fit checks in the UI. Null where there is no canvas. */
export function canvasMeasure(): Measure | null {
  if (typeof document === "undefined") return null;
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  const ctx = measureCtx;
  if (!ctx) return null;
  return (text, font) => { ctx.font = font; return ctx.measureText(text).width; };
}

/** The fonts a preset draws with (both of them for Big Stat). */
export const presetFonts = (p: TextPreset): TextFont[] => (p.lead ? [p.font, p.lead.font] : [p.font]);

/**
 * The layer as a transparent PNG the size of the frame, drawn once the fonts
 * are really loaded. Cached by its inputs, so the preview, the thumbnails and
 * the export share one image for the same words.
 */
export function renderTextLayer(a: RenderArgs): Promise<RenderedText> {
  const key = renderKey(a);
  const hit = cache.get(key);
  if (hit) return hit;
  const p = (async () => {
    const preset = TEXT_PRESETS[a.presetId];
    await ensureTextFonts(presetFonts(preset));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(a.width)); canvas.height = Math.max(1, Math.round(a.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    const measure: Measure = (text, font) => { ctx.font = font; return ctx.measureText(text).width; };
    const layout = layoutTextLayer({ preset, text: a.text, slot: a.slot, width: canvas.width, height: canvas.height, measure });
    drawTextLayer(ctx, preset, layout);
    return { url: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height, layout };
  })();
  p.catch(() => cache.delete(key));
  cache.set(key, p);
  if (cache.size > CACHE_MAX) { const first = cache.keys().next().value; if (first) cache.delete(first); }
  return p;
}

/** The rendered layer when it is already made, without starting a render. */
export function peekRendered(a: RenderArgs): Promise<RenderedText> | undefined {
  return cache.get(renderKey(a));
}
