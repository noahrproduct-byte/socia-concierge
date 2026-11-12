// Frames from inside a Reel or Short, so the niche scan reads the words that
// appear after the cover ("send this to someone you'd ___ with" usually lands
// a second or two in). Only from what official data gives us: the video file
// Instagram's Business Discovery returns for a Reel, read on the server with
// ffmpeg at a few moments; and for a YouTube Short, the frames YouTube itself
// publishes at a quarter, half and three quarters of the video. Anything that
// fails gives no frames, and the Reel is studied from its cover and caption as
// before. Server only.
import { execFile } from "node:child_process";
import { coverImage } from "./study";

export type Frame = { media_type: "image/jpeg" | "image/png" | "image/webp"; data: string; at: string };

/** Hosts a Reel's video file may come from: Instagram's own CDNs. */
const VIDEO_HOSTS = [/(^|\.)cdninstagram\.com$/, /(^|\.)fbcdn\.net$/];
/** Where in a Reel the frames are read, seconds: past the cover, where the on-screen line and the ask usually are. */
export const FRAME_TIMES = [1.5, 3.5, 6] as const;
const FRAME_TIMEOUT_MS = 15_000;
const MAX_FRAME_BYTES = 600_000;

/** The YouTube video id from a watch, shorts or youtu.be link; null otherwise. */
export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (/(^|\.)youtube\.com$/.test(u.hostname)) {
      const v = u.searchParams.get("v");
      if (v && /^[\w-]{6,20}$/.test(v)) return v;
      const m = u.pathname.match(/^\/shorts\/([\w-]{6,20})/);
      return m ? m[1] : null;
    }
    if (u.hostname === "youtu.be") {
      const id = u.pathname.slice(1);
      return /^[\w-]{6,20}$/.test(id) ? id : null;
    }
  } catch {
    // not a URL
  }
  return null;
}

/** A video link the scan may read: https and on an Instagram CDN. */
export function readableVideo(url: string | null | undefined): URL | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && VIDEO_HOSTS.some((re) => re.test(u.hostname)) ? u : null;
  } catch {
    return null;
  }
}

let ffmpegPath: string | null | undefined;
async function ffmpeg(): Promise<string | null> {
  if (ffmpegPath !== undefined) return ffmpegPath;
  try {
    const mod = (await import("ffmpeg-static")) as unknown as { default?: string | null } | string;
    ffmpegPath = (typeof mod === "string" ? mod : mod.default) ?? null;
  } catch {
    ffmpegPath = null;
  }
  return ffmpegPath;
}

/** One frame at `at` seconds as a small JPEG, or null. */
function grab(bin: string, url: string, at: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    execFile(
      bin,
      ["-hide_banner", "-loglevel", "error", "-ss", String(at), "-i", url, "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "6", "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1"],
      { encoding: "buffer", timeout: FRAME_TIMEOUT_MS, maxBuffer: MAX_FRAME_BYTES * 2 },
      (err, stdout) => {
        const buf = stdout as unknown as Buffer;
        resolve(!err && buf && buf.length > 0 && buf.length <= MAX_FRAME_BYTES ? buf : null);
      },
    );
  });
}

/**
 * Frames from inside one Reel or Short, in order; [] when none can be read.
 * Instagram: read from the video file at FRAME_TIMES. YouTube: the three
 * frames YouTube publishes (hq1, hq2, hq3).
 */
export async function reelFrames(r: { platform: string; url: string; video?: string | null }): Promise<Frame[]> {
  if (r.platform === "youtube") {
    const id = youtubeId(r.url);
    if (!id) return [];
    const imgs = await Promise.all(["hq1", "hq2", "hq3"].map((n) => coverImage(`https://i.ytimg.com/vi/${id}/${n}.jpg`)));
    return imgs.flatMap((img, i) => (img ? [{ ...img, at: ["a quarter in", "halfway", "three quarters in"][i] }] : []));
  }
  const video = readableVideo(r.video);
  if (!video) return [];
  const bin = await ffmpeg();
  if (!bin) return [];
  const bufs = await Promise.all(FRAME_TIMES.map((t) => grab(bin, video.toString(), t)));
  return bufs.flatMap((b, i) => (b ? [{ media_type: "image/jpeg" as const, data: b.toString("base64"), at: `${FRAME_TIMES[i]} s` }] : []));
}
