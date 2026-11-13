// Phone videos over the storage limit, made small enough to upload (Noah,
// 2026-11-10: his 158 MB 4K iPhone clip registered but never uploaded, and
// every clip over 50 MB in his account was stuck the same way). Supabase
// Storage refuses a file over 50 MB, so a bigger clip is re-encoded in this
// browser first: H.264 at 1080p on the device's own video encoder (WebCodecs,
// through Mediabunny), at a bitrate that keeps the file under the limit. The
// original on the person's device is untouched. Fail-safe: null when this
// browser can't, and the caller says so instead of pretending.

/** What storage accepts per file. */
export const STORAGE_FILE_LIMIT = 50 * 1024 * 1024;
/** Above this a clip is made smaller before it uploads (room for the container). */
export const SHRINK_ABOVE = 45 * 1024 * 1024;
const TARGET_BYTES = 42 * 1024 * 1024;
const AUDIO_BPS = 128_000;
const MAX_VIDEO_BPS = 8_000_000;
/** Below this the picture would fall apart; such a clip is too long to send. */
const MIN_VIDEO_BPS = 700_000;

/**
 * iPhones record HEVC by default; Chrome and Edge on most computers cannot decode it, so a clip left as it is
 * previews black and renders black for other people on the account. A clip this browser can read is
 * converted to H.264 on the device before it uploads (it is being re-encoded anyway over 45 MB).
 */
export const needsTranscode = (codec: string | null | undefined): boolean => /^(hevc|hvc1|hev1|h265)/i.test(codec ?? "");

export type ShrinkPlan = { needed: false } | { needed: true; possible: false } | { needed: true; possible: true; videoBps: number; width: number; height: number };

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** Whether a clip must shrink, and to what: the long side at most 1920, a bitrate that fits the limit. Pure. */
export function shrinkPlan(bytes: number, durationSec: number, width: number | null, height: number | null, force = false): ShrinkPlan {
  if (bytes <= SHRINK_ABOVE && !force) return { needed: false };
  const sec = Math.max(1, durationSec);
  const videoBps = Math.min(MAX_VIDEO_BPS, Math.floor((TARGET_BYTES * 8) / sec - AUDIO_BPS));
  if (videoBps < MIN_VIDEO_BPS) return { needed: true, possible: false };
  const w = width ?? 1080, h = height ?? 1920;
  const k = Math.min(1, 1920 / Math.max(w, h));
  return { needed: true, possible: true, videoBps, width: even(w * k), height: even(h * k) };
}

/** One encode at a video bitrate; the MP4's bytes, or null when this browser can't. */
async function encode(file: File, width: number, height: number, videoBps: number, onProgress?: (ratio: number) => void): Promise<ArrayBuffer | null> {
  const mb = await import("mediabunny");
  const input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BlobSource(file) });
  try {
    const target = new mb.BufferTarget();
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target });
    const conversion = await mb.Conversion.init({
      input, output,
      // The display size (rotation applied), long side 1920 at most; a key frame every second so the editor can seek.
      video: { width, height, fit: "contain", codec: "avc", bitrate: videoBps, keyFrameInterval: 1, hardwareAcceleration: "prefer-hardware", forceTranscode: true },
      audio: { codec: "aac", bitrate: AUDIO_BPS },
    });
    if (!conversion.isValid) return null;
    conversion.onProgress = (p) => onProgress?.(p);
    await conversion.execute();
    return target.buffer ?? null;
  } finally {
    input.dispose();
  }
}

/**
 * The clip as an MP4 small enough to upload, or null when this browser can't
 * make one. A phone's hardware encoder can run well over the bitrate it's given
 * (a 25 s 4K clip asked for 8 Mbps came out at 16), so a result over the mark
 * is made once more at a bitrate scaled to fit.
 */
export async function shrinkForUpload(file: File, probe: { durationSec: number; width: number | null; height: number | null }, onProgress?: (ratio: number) => void, force = false): Promise<File | null> {
  const plan = shrinkPlan(file.size, probe.durationSec, probe.width, probe.height, force);
  if (!plan.needed) return file;
  if (!plan.possible) return null;
  try {
    let bps = plan.videoBps;
    for (let attempt = 0; attempt < 2; attempt++) {
      const buf = await encode(file, plan.width, plan.height, bps, (p) => onProgress?.(attempt ? 0.5 + p / 2 : p / 2));
      if (!buf) return null;
      if (buf.byteLength <= SHRINK_ABOVE) return new File([buf], file.name.replace(/\.[^.]+$/, "") + ".mp4", { type: "video/mp4", lastModified: file.lastModified });
      bps = Math.max(MIN_VIDEO_BPS, Math.floor(bps * (TARGET_BYTES / buf.byteLength) * 0.9));
    }
    return null;
  } catch {
    return null;
  }
}
