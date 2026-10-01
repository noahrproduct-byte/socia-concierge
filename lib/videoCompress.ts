// In-browser video compression with ffmpeg.wasm, used to shrink oversized
// uploads before they hit storage. Deliberately FAIL-SAFE: every path that
// can't produce a smaller file returns null, and the caller then uploads the
// original unchanged — compression can never break an upload.
//
// Single-threaded core, self-hosted from /public/ffmpeg, loaded via blob URLs.
// The single-thread core needs no SharedArrayBuffer, so SOCIA does not have to
// turn on cross-origin isolation (COOP/COEP) headers app-wide. The ~31 MB core
// is fetched only the first time a compression actually runs (lazy), then reused.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FFmpegInstance = any;

/** Videos at or above this size are offered compression before upload. */
export const COMPRESS_THRESHOLD_BYTES = 40 * 1024 * 1024; // 40 MB

let ffmpegPromise: Promise<FFmpegInstance | null> | null = null;

async function loadFfmpeg(): Promise<FFmpegInstance | null> {
  if (typeof window === "undefined") return null;
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      try {
        const { FFmpeg } = await import("@ffmpeg/ffmpeg");
        const { toBlobURL } = await import("@ffmpeg/util");
        const base = "/ffmpeg";
        const ff = new FFmpeg();
        await ff.load({
          coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
        });
        return ff;
      } catch {
        // Unsupported browser, blocked worker, fetch failure — give up quietly.
        return null;
      }
    })();
  }
  return ffmpegPromise;
}

/** True when a file is a candidate for pre-upload compression. */
export function shouldOfferCompression(file: { type?: string; size: number }): boolean {
  return typeof window !== "undefined" && (file.type ?? "").startsWith("video/") && file.size >= COMPRESS_THRESHOLD_BYTES;
}

export type CompressProgress = (ratio: number) => void;

/**
 * Compress a video to a 1080p-max H.264 MP4 (faststart). Returns a smaller File,
 * or null when it can't help (unsupported, failed, or the result wasn't smaller)
 * — the caller uploads the original in that case. Never throws.
 */
export async function compressVideo(file: File, onProgress?: CompressProgress): Promise<File | null> {
  if (typeof window === "undefined") return null;
  if (!(file.type ?? "").startsWith("video/")) return null;

  const ff = await loadFfmpeg();
  if (!ff) return null;

  const ext = file.name.match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase() || ".mp4";
  const inName = `in${ext}`;
  const outName = "out.mp4";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let onP: ((e: { progress: number }) => void) | null = null;

  try {
    const { fetchFile } = await import("@ffmpeg/util");
    await ff.writeFile(inName, await fetchFile(file));

    if (onProgress) {
      onP = (e: { progress: number }) => onProgress(Math.min(1, Math.max(0, e.progress || 0)));
      ff.on("progress", onP);
    }

    await ff.exec([
      "-i", inName,
      // Fit within 1080x1920 keeping aspect (only ever shrinks), even dimensions.
      "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease:force_divisible_by=2",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      outName,
    ]);

    const data = (await ff.readFile(outName)) as Uint8Array | string;
    // Best-effort cleanup of the virtual FS so repeated runs don't accumulate.
    try { await ff.deleteFile(inName); } catch { /* ignore */ }
    try { await ff.deleteFile(outName); } catch { /* ignore */ }

    if (!data || typeof data === "string" || data.byteLength === 0) return null;
    const blob = new Blob([data as BlobPart], { type: "video/mp4" });
    // Only use it if it actually shrank the file.
    if (blob.size >= file.size) return null;
    const outFile = new File([blob], file.name.replace(/\.[^.]+$/, "") + "-compressed.mp4", { type: "video/mp4" });
    return outFile;
  } catch {
    return null;
  } finally {
    if (onP) {
      try { ff.off("progress", onP); } catch { /* ignore */ }
    }
  }
}
