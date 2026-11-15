// An account's video style (reports/animation-maker-prompt.md, Noah
// 2026-11-14): what its own Reels look like, measured from the videos, so
// every animated video SOCIA makes for it looks like it belongs on the
// account. Identity (palette, type, logo, characters, formats) comes from the
// account's own Reels; structure (hooks, pacing, endings) from competitors'
// Reels made the same way. Competitors' brand, characters, artwork and text
// are never taken. The person sees and corrects it in Settings. Pure and
// browser-safe; the reading is in ./videoStyleLoad.ts.

/** Reels read: the account's own and its competitors'. */
export const OWN_REELS = 8;
export const COMPETITOR_REELS = 6;
/** Frames read from inside each Reel. */
export const OWN_FRAMES = 5;
export const COMPETITOR_FRAMES = 3;
/** Read again after a week: accounts change how their videos look. */
export const STYLE_REF_TTL_MS = 7 * 86_400_000;

/** Type families the renderer can draw; the read picks the closest. */
export const FONTS = ["sans", "condensed", "serif", "rounded", "mono", "handwritten"] as const;
export type FontId = (typeof FONTS)[number];
export const FONT_LABEL: Record<FontId, string> = {
  sans: "Clean sans",
  condensed: "Bold condensed",
  serif: "Serif",
  rounded: "Rounded",
  mono: "Monospace",
  handwritten: "Handwritten",
};

export const LOGO_SPOTS = ["top-left", "top-right", "top-center", "bottom-left", "bottom-right", "bottom-center", "center", "none"] as const;
export type LogoSpot = (typeof LOGO_SPOTS)[number];

export type StyleSource = {
  id: string;
  from: "own" | "competitor";
  account: string;
  permalink: string | null;
  thumb: string | null;
  views: number | null;
  /** Against that account's own median views; null when unknown. */
  multiple: number | null;
  /** Seconds long, measured from the file. */
  seconds: number | null;
};

export type Swatch = { hex: string; share: number };

export type StyleFormat = {
  name: string;
  /** How it is made, in the brand read's terms (lib/intel/reelReadCore.ts). */
  made: string;
  /** What it looks like: the stage, the characters, the type, the layout. */
  look: string;
  /** What carries the video: a counter, a comparison, rounds, a progress bar, a story; "" when nothing does. */
  spine: string;
  ids: string[];
};

export type VideoStyle = {
  version: 1;
  read_at: string;
  sources: StyleSource[];
  /** Counted from the files, not the model. */
  measured: {
    own: { seconds: number | null; cutsPer10s: number | null; palette: Swatch[] };
    competitors: { seconds: number | null; cutsPer10s: number | null };
    /** What the Reels sound like and the pitch of each voice SOCIA can use (lib/voiceRead.ts); absent on reads made before it was measured. */
    voice?: import("./voiceRead").HeardVoices;
  };
  /** From the account's own Reels. */
  identity: {
    background: string;
    text: string;
    accent: string;
    /** The colour the account sets its key words and highlights in; absent on reads made before it was asked for. */
    key?: string;
    /** Every colour that matters, from the measured palette. */
    palette: string[];
    font: FontId;
    /** How the words look: weight, case, size, where they sit, which word gets emphasis. */
    type: string;
    logo: { spot: LogoSpot; what: string };
    /** Recurring characters or illustration style; "" when none. */
    characters: string;
    /** The fixed frame the videos are built on; "" when there isn't one. */
    stage: string;
    formats: StyleFormat[];
  };
  /** From competitors' Reels: how they are built, never what they look like. */
  structure: { hooks: string[]; pacing: string; spines: string[]; endings: string[] };
  limitations: string[];
  /** When the person confirmed or corrected it; null until then. */
  confirmed_at: string | null;
};

// ---------------------------------------------------------------- measuring ----

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
export const toHex = (r: number, g: number, b: number) => `#${hex2(r)}${hex2(g)}${hex2(b)}`.toUpperCase();
const fromHex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const dist = (a: [number, number, number], b: [number, number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9A-Fa-f]{6}$/.test(v);

/**
 * The colours that cover a video's frames, counted from raw RGB pixels: each
 * pixel goes in a bucket of near colours, close buckets merge, and the result
 * is each colour's share of the frame. Pure.
 */
export function paletteFromPixels(rgb: Uint8Array, max = 9): Swatch[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 2 < rgb.length; i += 3) {
    const r = rgb[i], g = rgb[i + 1], b = rgb[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const k = buckets.get(key);
    if (k) { k.n++; k.r += r; k.g += g; k.b += b; } else buckets.set(key, { n: 1, r, g, b });
  }
  const total = rgb.length / 3;
  if (!total) return [];
  const merged: { n: number; c: [number, number, number] }[] = [];
  for (const k of [...buckets.values()].sort((a, b) => b.n - a.n)) {
    const c: [number, number, number] = [k.r / k.n, k.g / k.n, k.b / k.n];
    const near = merged.find((m) => dist(m.c, c) < 48);
    if (near) {
      const n = near.n + k.n;
      near.c = [(near.c[0] * near.n + c[0] * k.n) / n, (near.c[1] * near.n + c[1] * k.n) / n, (near.c[2] * near.n + c[2] * k.n) / n];
      near.n = n;
    } else merged.push({ n: k.n, c });
  }
  return merged
    .sort((a, b) => b.n - a.n)
    // Words cover little of a frame: a colour counts from 0.4% of it, so the highlight colour isn't lost.
    .filter((m) => m.n / total >= 0.004)
    .slice(0, max)
    .map((m) => ({ hex: toHex(...m.c), share: Math.round((m.n / total) * 1000) / 1000 }));
}

/** Several videos' palettes as one, weighted by how much of each video a colour covers. Pure. */
export function mergePalettes(list: Swatch[][], max = 10): Swatch[] {
  const all = list.flatMap((p) => p.map((s) => ({ ...s, share: s.share / Math.max(list.length, 1) })));
  const out: { c: [number, number, number]; share: number }[] = [];
  for (const s of all.sort((a, b) => b.share - a.share)) {
    const c = fromHex(s.hex);
    const near = out.find((o) => dist(o.c, c) < 48);
    if (near) near.share += s.share; else out.push({ c, share: s.share });
  }
  return out.sort((a, b) => b.share - a.share).slice(0, max).map((o) => ({ hex: toHex(...o.c), share: Math.round(o.share * 1000) / 1000 }));
}

/** The times ffmpeg's scene filter reported a cut at, from its showinfo log. Pure. */
export function cutTimes(log: string): number[] {
  const out: number[] = [];
  for (const m of log.matchAll(/pts_time:([0-9.]+)/g)) {
    const t = Number(m[1]);
    if (Number.isFinite(t) && (!out.length || t - out[out.length - 1] > 0.25)) out.push(t);
  }
  return out;
}

/** Cuts per ten seconds of video, or null without a length. Pure. */
export const cutsPer10s = (cuts: number, seconds: number | null) => (seconds && seconds > 0 ? Math.round((cuts / seconds) * 100) / 10 : null);

const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x));
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
};
export { avg as averageOf };

// ------------------------------------------------------------- cleaning ----

const str = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").replace(/\s*[—–]\s*/g, ", ").trim().slice(0, n) : "");
const list = (v: unknown, n: number, each: number) => (Array.isArray(v) ? v.map((x) => str(x, each)).filter(Boolean).slice(0, n) : []);

/**
 * The model's read kept only where it holds up: colours from the measured
 * palette (never one it made up), a known type family and logo spot, kinds of
 * video seen in at least two of the account's own Reels. Pure.
 */
export function cleanStyleRead(raw: unknown, ctx: { sources: StyleSource[]; palette: Swatch[]; own: { seconds: number | null; cutsPer10s: number | null }; competitors: { seconds: number | null; cutsPer10s: number | null }; now: Date }): VideoStyle {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const id = (r.identity && typeof r.identity === "object" ? r.identity : {}) as Record<string, unknown>;
  const st = (r.structure && typeof r.structure === "object" ? r.structure : {}) as Record<string, unknown>;
  const measured = ctx.palette.map((s) => s.hex);
  // A colour the model names must be one the frames really have (or very close to one).
  const snap = (v: unknown, fallback: string) => {
    if (!isHex(v)) return fallback;
    const c = fromHex(v.toUpperCase());
    const near = measured.map((h) => ({ h, d: dist(fromHex(h), c) })).sort((a, b) => a.d - b.d)[0];
    return near && near.d < 60 ? near.h : fallback;
  };
  const bg = snap(id.background, measured[0] ?? "#111111");
  const ownIds = new Set(ctx.sources.filter((s) => s.from === "own").map((s) => s.id));
  const formats: StyleFormat[] = (Array.isArray(id.formats) ? id.formats : [])
    .map((f) => (f && typeof f === "object" ? (f as Record<string, unknown>) : {}))
    .map((f) => ({
      name: str(f.name, 40),
      made: str(f.made, 20) || "mixed",
      look: str(f.look, 360),
      spine: str(f.spine, 160),
      ids: [...new Set((Array.isArray(f.reels) ? f.reels : []).filter((x): x is string => typeof x === "string" && ownIds.has(x)))],
    }))
    .filter((f) => f.name && f.look && f.ids.length >= 2)
    .slice(0, 4);
  const logo = (id.logo && typeof id.logo === "object" ? id.logo : {}) as Record<string, unknown>;
  return {
    version: 1,
    read_at: ctx.now.toISOString(),
    sources: ctx.sources,
    measured: { own: { ...ctx.own, palette: ctx.palette }, competitors: ctx.competitors },
    identity: {
      background: bg,
      text: snap(id.text, measured.find((h) => h !== bg) ?? "#FFFFFF"),
      accent: snap(id.accent, measured[2] ?? measured[1] ?? "#2F5BFF"),
      ...(snap(id.key, "") ? { key: snap(id.key, "") } : {}),
      palette: measured,
      font: (FONTS as readonly string[]).includes(String(id.font)) ? (id.font as FontId) : "sans",
      type: str(id.type, 300),
      logo: { spot: (LOGO_SPOTS as readonly string[]).includes(String(logo.spot)) ? (logo.spot as LogoSpot) : "none", what: str(logo.what, 120) },
      characters: str(id.characters, 300),
      stage: str(id.stage, 300),
      formats,
    },
    structure: { hooks: list(st.hooks, 4, 160), pacing: str(st.pacing, 240), spines: list(st.spines, 4, 160), endings: list(st.endings, 3, 160) },
    limitations: list(r.limitations, 3, 160),
    confirmed_at: null,
  };
}

/** What the person may change from Settings, made safe and merged into the read. Pure. */
export function applyStyleEdits(base: VideoStyle, edits: unknown, now: Date): VideoStyle {
  const e = (edits && typeof edits === "object" ? edits : {}) as Record<string, unknown>;
  const id = (e.identity && typeof e.identity === "object" ? e.identity : {}) as Record<string, unknown>;
  const pal = Array.isArray(id.palette) ? id.palette.filter(isHex).map((h) => h.toUpperCase()).slice(0, 8) : base.identity.palette;
  const pick = (v: unknown, cur: string) => (isHex(v) ? v.toUpperCase() : cur);
  const logo = (id.logo && typeof id.logo === "object" ? id.logo : {}) as Record<string, unknown>;
  const formats = Array.isArray(id.formats)
    ? id.formats
        .map((f) => (f && typeof f === "object" ? (f as Record<string, unknown>) : {}))
        .map((f, i) => ({ ...(base.identity.formats[i] ?? { made: "mixed", spine: "", ids: [] }), name: str(f.name, 40), look: str(f.look, 360), spine: str(f.spine, 160) || (base.identity.formats[i]?.spine ?? "") }))
        .filter((f) => f.name && f.look)
        .slice(0, 4)
    : base.identity.formats;
  return {
    ...base,
    identity: {
      ...base.identity,
      background: pick(id.background, base.identity.background),
      text: pick(id.text, base.identity.text),
      accent: pick(id.accent, base.identity.accent),
      ...(isHex(id.key) ? { key: id.key.toUpperCase() } : base.identity.key ? { key: base.identity.key } : {}),
      palette: pal.length ? pal : base.identity.palette,
      font: (FONTS as readonly string[]).includes(String(id.font)) ? (id.font as FontId) : base.identity.font,
      type: "type" in id ? str(id.type, 300) : base.identity.type,
      logo: {
        spot: (LOGO_SPOTS as readonly string[]).includes(String(logo.spot)) ? (logo.spot as LogoSpot) : base.identity.logo.spot,
        what: "what" in logo ? str(logo.what, 120) : base.identity.logo.what,
      },
      characters: "characters" in id ? str(id.characters, 300) : base.identity.characters,
      stage: "stage" in id ? str(id.stage, 300) : base.identity.stage,
      formats,
    },
    confirmed_at: now.toISOString(),
  };
}

/** Whether the read should be done again: never read, or older than a week. */
export const styleRefStale = (s: VideoStyle | null | undefined, now: Date) => !s || now.getTime() - Date.parse(s.read_at) > STYLE_REF_TTL_MS;

/** A saved style, only if it has the shape this version writes. Pure. */
export function readSavedStyle(v: unknown): VideoStyle | null {
  if (!v || typeof v !== "object") return null;
  const s = v as VideoStyle;
  return s.version === 1 && typeof s.read_at === "string" && s.identity && Array.isArray(s.sources) ? s : null;
}
