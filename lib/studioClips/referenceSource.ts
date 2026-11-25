// Where a reference video came from when it isn't a file the person dropped (Noah, 2026-11-25): a Reel picked in
// Discover ("Make a video like this", "Make this video") or a Reel link pasted in the Video editor. The Reel itself
// is fetched through SOCIA's authorized Instagram read (app/api/studio/reference/reel) and read in the browser like
// a dropped file; when it can't be fetched, its link, cover, caption and numbers still travel, and the editor says
// plainly that the video wasn't studied. The paid part of reading it (its speech) is kept per Reel in this browser,
// so going back and forth doesn't pay twice. Pure helpers plus a guarded localStorage cache; browser-safe.

import type { EditDirection } from "./editDirection";
import type { ProvenReel, ReelRef } from "../trendSignals";
import type { ReferenceMusic } from "../music/referenceMusic";

/** A Reel as Discover (or a pasted link) knows it: only what the platform published. */
export type ReelSource = {
  /** The Reel's own link. */
  link: string;
  /** Instagram's short code for it (the cache key). */
  code: string | null;
  handle: string | null;
  account: string | null;
  thumb: string | null;
  caption: string | null;
  format: string | null;
  views: number | null;
  multiplier: number | null;
  /** The creative structure SOCIA judged transfers (Trending), when there is one. */
  structure?: string | null;
};

/** A Discover Reel as a reference source: what the platform published about it, nothing more. Pure. */
export function sourceOfReel(r: Pick<ProvenReel, "url" | "accountHandle" | "accountName" | "thumb" | "title" | "line" | "format" | "views" | "multiplier"> & { fitStructure?: string }): ReelSource {
  return {
    link: r.url, code: parseReelLink(r.url)?.code ?? null, handle: cleanHandle(r.accountHandle), account: r.accountName,
    thumb: r.thumb, caption: r.line ?? r.title, format: r.format, views: r.views, multiplier: r.multiplier, structure: r.fitStructure ?? null,
  };
}

/** A plan post's or a video idea's Reel (lib/trendSignals.ts ReelRef) as a reference source; null unless it's an Instagram Reel. Pure. */
export function sourceOfRef(r: ReelRef | null | undefined): ReelSource | null {
  if (!r?.url) return null;
  const parsed = parseReelLink(r.url);
  if (!parsed) return null;
  return {
    link: parsed.link, code: parsed.code, handle: cleanHandle(r.account) ?? parsed.handle, account: r.account,
    thumb: r.thumb ?? null, caption: r.title, format: "Reel", views: r.views, multiplier: r.multiplier, structure: r.structure,
  };
}

/** A Reel link someone chose elsewhere (Ask SOCIA's reference gallery) as a reference source; null unless it's an Instagram Reel. Pure. */
export function sourceOfLink(url: string, creator?: string | null, title?: string | null): ReelSource | null {
  const parsed = parseReelLink(url);
  if (!parsed) return null;
  return { link: parsed.link, code: parsed.code, handle: parsed.handle ?? cleanHandle(creator), account: creator ?? null, thumb: null, caption: title ?? null, format: "Reel", views: null, multiplier: null };
}

/** A reference to hand to the Video editor from a source: no video link yet, the editor fetches it. Pure. */
export function referenceOf(src: ReelSource | null, served: string | null = null): { url: string | null; name: string; reel: ReelSource } | null {
  return src ? { url: served, name: `${src.handle ? `@${src.handle}` : src.account ?? "reel"} ${src.format ?? "Reel"}.mp4`, reel: src } : null;
}

/** The link SOCIA serves for a Discover Reel's video file when the page was given one, else null. Pure. */
export function servedVideoOf(r: { refToken?: string | null; video?: string | null }): string | null {
  return r.refToken && r.video ? `/api/studio/reference/media?url=${encodeURIComponent(r.video)}&token=${r.refToken}` : null;
}

/** Instagram's short code and, when the link carries it, the account name. Pure. */
export function parseReelLink(raw: string): { link: string; code: string; handle: string | null } | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== "https:" || !/(^|\.)instagram\.com$/i.test(u.hostname)) return null;
  const m = /^\/(?:([A-Za-z0-9._]{1,30})\/)?(?:reels?|p|tv)\/([A-Za-z0-9_-]{5,40})\/?$/i.exec(u.pathname);
  if (!m) return null;
  const handle = m[1] && !/^(reel|reels|p|tv|explore|stories)$/i.test(m[1]) ? m[1].toLowerCase() : null;
  return { link: `https://www.instagram.com/reel/${m[2]}/`, code: m[2], handle };
}

/** An account name as typed ("@salvos", "salvos"), or null when it isn't one. Pure. */
export function cleanHandle(raw: string | null | undefined): string | null {
  const h = (raw ?? "").trim().replace(/^@/, "").toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(h) ? h : null;
}

/** A source made safe from a hand-off or a server answer. Pure. */
export function sanitizeSource(v: unknown): ReelSource | null {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const link = typeof o.link === "string" ? o.link.slice(0, 400) : "";
  if (!/^https:\/\//.test(link)) return null;
  const s = (k: string, n: number) => (typeof o[k] === "string" && (o[k] as string).trim() ? (o[k] as string).slice(0, n) : null);
  const num = (k: string) => (typeof o[k] === "number" && Number.isFinite(o[k]) && (o[k] as number) >= 0 ? (o[k] as number) : null);
  return {
    link, code: s("code", 40) ?? parseReelLink(link)?.code ?? null, handle: cleanHandle(s("handle", 40)), account: s("account", 80),
    thumb: s("thumb", 1000), caption: s("caption", 300), format: s("format", 20), views: num("views"), multiplier: num("multiplier"), structure: s("structure", 140),
  };
}

// ---------------------------------------------------------------------------
// What reading a reference found, kept per Reel in this browser
// ---------------------------------------------------------------------------

/** Bump when what's kept changes: older entries are read again. */
export const REF_CACHE_VERSION = 1;
const CACHE_PREFIX = "socia.ref.";
const CACHE_DAYS = 30;

export type CachedRead = {
  durationSec: number;
  cuts: number[] | null;
  words: { text: string; startMs: number; endMs: number }[] | null;
  audio: { hasAudio: boolean; level: string; audibleRatio: number | null } | null;
  /** the music, measured (lib/music/referenceMusic.ts); missing in reads saved before it was measured */
  music?: ReferenceMusic | null;
  at: string;
};

const cacheKey = (code: string) => `${CACHE_PREFIX}v${REF_CACHE_VERSION}.${code}`;

/** What an earlier read of this Reel found, or null. Never throws. */
export function readCached(code: string | null, now = new Date()): CachedRead | null {
  if (!code) return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(code));
    if (!raw) return null;
    const c = JSON.parse(raw) as CachedRead;
    if (!c || typeof c.durationSec !== "number" || now.getTime() - Date.parse(c.at) > CACHE_DAYS * 86_400_000) return null;
    return c;
  } catch {
    return null;
  }
}

/** Keep what a read found (the frames are read again from the video, for free). Never throws. */
export function writeCached(code: string | null, c: Omit<CachedRead, "at">, now = new Date()): void {
  if (!code) return;
  try { window.localStorage.setItem(cacheKey(code), JSON.stringify({ ...c, at: now.toISOString() })); } catch { /* storage off or full */ }
}

// ---------------------------------------------------------------------------
// Creative direction from what the reference showed
// ---------------------------------------------------------------------------

/**
 * The parts of the creative direction a reference's measurements support: pace from how often it cuts, captions
 * and what leads from whether someone speaks, transitions from the pace, music when there's sound but no speech.
 * Only what the read measured; the rest stays as it was. Pure.
 */
export function directionFromReference(r: { durationSec: number; cuts: number[] | null; words: unknown[] | null; audio: { hasAudio: boolean; audibleRatio: number | null } | null }): Partial<EditDirection> {
  const out: Partial<EditDirection> = {};
  if (r.cuts && r.durationSec > 0) {
    const shot = r.durationSec / (r.cuts.length + 1);
    out.pace = shot < 1.8 ? "fast" : shot <= 4 ? "steady" : "calm";
    out.transitions = shot < 1.8 ? "punchy" : "cuts";
  }
  const speaks = Boolean(r.words && r.words.length >= 8);
  if (speaks) {
    out.captions = out.pace === "fast" ? "word" : "bold";
    out.lead = "person";
  }
  if (r.audio?.hasAudio && !speaks) out.music = out.pace === "fast" ? "upbeat" : "calm";
  return out;
}

/** The direction's changed parts in words, for the note under it ("Set from the reference: fast pace, word captions"). Pure. */
export function directionChanges(set: Partial<EditDirection>): string[] {
  const W: Record<string, Record<string, string>> = {
    pace: { fast: "fast pace", steady: "steady pace", calm: "calm pace" },
    transitions: { punchy: "punchy transitions", cuts: "hard cuts" },
    captions: { word: "word-by-word captions", bold: "bold key-word captions" },
    lead: { person: "a person on screen" },
    music: { upbeat: "upbeat music", calm: "calm music" },
  };
  return Object.entries(set).map(([k, v]) => W[k]?.[v as string]).filter((x): x is string => Boolean(x));
}
