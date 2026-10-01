// Copies the self-hosted ffmpeg.wasm single-thread core into public/ffmpeg so
// the in-browser video compressor can load it same-origin (no CDN, no COOP/COEP).
// Runs on install and before build; never fails the build if @ffmpeg/core is
// absent. The UMD build is what @ffmpeg/ffmpeg's worker importScripts expects,
// and @ffmpeg/core's "require" export condition points exactly at it.
import { mkdir, copyFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, join } from "node:path";

const require = createRequire(import.meta.url);
try {
  const files = [require.resolve("@ffmpeg/core"), require.resolve("@ffmpeg/core/wasm")];
  const dest = join(process.cwd(), "public", "ffmpeg");
  await mkdir(dest, { recursive: true });
  for (const src of files) {
    await copyFile(src, join(dest, basename(src)));
  }
  console.log("[ffmpeg] copied core to public/ffmpeg");
} catch (e) {
  console.warn("[ffmpeg] skipped core copy:", e?.message ?? e);
}
