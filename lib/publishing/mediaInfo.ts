// Browser-only media measurement for the composer. Everything here degrades
// to null instead of throwing: a dimension or duration that could not be read
// stays null, and validate.ts turns that into a warning ("will be checked at
// upload"), never a pass and never a block.
//
// Import only from client components.

import type { MediaItem, MediaKind } from "./types";

/** The draft keeps a local preview next to the wire fields; toPayload strips it. */
export type MediaItemWithPreview = MediaItem & {
  /** Object URL for a file that is still in this browser (or the poster of a remote video). */
  previewUrl?: string | null;
  /** Data-URL JPEG of the chosen cover frame, when one was rendered. */
  poster?: string | null;
};

export type Measured = Partial<MediaItem> & { kind: MediaKind; previewUrl: string };

const METADATA_TIMEOUT_MS = 10_000;

export function kindFromMime(mime: string, name = ""): MediaKind {
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "image";
  return /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(name) ? "video" : "image";
}

/**
 * The type the browser reports, or "" when it reports none (some browsers leave
 * File.type empty for MOV). Never inferred from the name: an unknown type is a
 * readiness warning the platform settles at upload, not a guess.
 */
export function mimeOf(file: File): string {
  return file.type || "";
}

function withTimeout<T>(p: Promise<T>, fallback: T, ms = METADATA_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(fallback); });
  });
}

async function imageSize(file: File, url: string): Promise<{ width: number | null; height: number | null }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file);
      const out = { width: bmp.width, height: bmp.height };
      bmp.close?.();
      return out;
    } catch {
      // fall through to <img>
    }
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || null, height: img.naturalHeight || null });
    img.onerror = () => resolve({ width: null, height: null });
    img.src = url;
  });
}

function videoMeta(url: string): Promise<{ width: number | null; height: number | null; duration: number | null }> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => {
      const d = Number.isFinite(v.duration) ? v.duration : null;
      resolve({ width: v.videoWidth || null, height: v.videoHeight || null, duration: d });
      v.removeAttribute("src");
      v.load();
    };
    v.onerror = () => resolve({ width: null, height: null, duration: null });
    v.src = url;
  });
}

/**
 * Measure a file the person just picked. Never throws. Fields that could not be
 * read are null, so the readiness checks can say "not measured" instead of guessing.
 */
export async function measure(file: File): Promise<Measured> {
  const mime = mimeOf(file);
  const kind = kindFromMime(mime, file.name);
  const previewUrl = URL.createObjectURL(file);
  const base: Measured = { kind, name: file.name, mime, size: file.size, width: null, height: null, duration: null, path: null, url: null, previewUrl };
  try {
    if (kind === "image") {
      const s = await withTimeout(imageSize(file, previewUrl), { width: null, height: null });
      return { ...base, ...s };
    }
    const m = await withTimeout(videoMeta(previewUrl), { width: null, height: null, duration: null });
    return { ...base, ...m };
  } catch {
    return base;
  }
}

/**
 * Render one frame of a video as a JPEG data URL, for cover pickers and the
 * preview. Resolves null when the frame cannot be drawn (cross-origin video
 * without CORS headers, unsupported codec, timeout). Never throws.
 */
export async function posterFrame(src: File | string, atSeconds: number): Promise<string | null> {
  if (typeof document === "undefined") return null;
  const url = typeof src === "string" ? src : URL.createObjectURL(src);
  const own = typeof src !== "string";
  const work = new Promise<string | null>((resolve) => {
    const v = document.createElement("video");
    v.preload = "auto";
    v.muted = true;
    v.playsInline = true;
    if (!own) v.crossOrigin = "anonymous";
    let done = false;
    const finish = (val: string | null) => {
      if (done) return;
      done = true;
      resolve(val);
      v.removeAttribute("src");
      v.load();
    };
    v.onerror = () => finish(null);
    v.onloadedmetadata = () => {
      const d = Number.isFinite(v.duration) ? v.duration : 0;
      const t = Math.min(Math.max(0, atSeconds), Math.max(0, d - 0.05));
      try { v.currentTime = t; } catch { finish(null); }
    };
    v.onseeked = () => {
      try {
        const w = v.videoWidth, h = v.videoHeight;
        if (!w || !h) return finish(null);
        const scale = Math.min(1, 720 / Math.max(w, h));
        const c = document.createElement("canvas");
        c.width = Math.round(w * scale);
        c.height = Math.round(h * scale);
        const ctx = c.getContext("2d");
        if (!ctx) return finish(null);
        ctx.drawImage(v, 0, 0, c.width, c.height);
        finish(c.toDataURL("image/jpeg", 0.82));
      } catch {
        finish(null);
      }
    };
    v.src = url;
  });
  const out = await withTimeout(work, null);
  if (own) URL.revokeObjectURL(url);
  return out;
}

// ---------------------------------------------------------------------------
// Display helpers (pure)
// ---------------------------------------------------------------------------

/** A size that was never recorded (null) is a dash, never "0 B". */
export function fmtBytes(b: number | null): string {
  if (b == null || !Number.isFinite(b)) return "–";
  if (b >= 1024 * 1024 * 1024) return `${(b / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  if (b >= 1024) return `${Math.round(b / 1024)} KB`;
  return `${b} B`;
}

export function fmtDuration(s: number | null): string {
  if (s == null || !Number.isFinite(s)) return "–";
  const m = Math.floor(s / 60);
  const sec = Math.round(s - m * 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/** "9:16", "4:5", "1:1", "16:9" or a reduced ratio when none of the common ones fits. */
export function aspectLabel(width: number | null, height: number | null): string {
  if (!width || !height) return "–";
  const r = width / height;
  const common: [string, number][] = [["1:1", 1], ["9:16", 9 / 16], ["16:9", 16 / 9], ["4:5", 0.8], ["5:4", 1.25], ["4:3", 4 / 3], ["3:4", 0.75], ["1.91:1", 1.91], ["2:3", 2 / 3], ["3:2", 1.5]];
  for (const [label, v] of common) if (Math.abs(r - v) / v < 0.02) return label;
  const g = gcd(width, height);
  const a = width / g, b = height / g;
  return a > 99 || b > 99 ? `${r.toFixed(2)}:1` : `${a}:${b}`;
}

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a || 1;
}
