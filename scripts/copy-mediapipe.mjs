// Copies MediaPipe's vision runtime (the wasm the presenter cut-out runs on,
// lib/studioClips/matte.ts) into public/mediapipe/wasm so it loads same-origin,
// as the ffmpeg core does. Runs on install and before build; never fails the
// build if the package is absent. The model file (selfie_segmenter.tflite) is
// not in the npm package: it sits in public/mediapipe/ beside this folder.
import { mkdir, copyFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
try {
  const root = dirname(require.resolve("@mediapipe/tasks-vision"));
  const dest = join(process.cwd(), "public", "mediapipe", "wasm");
  await mkdir(dest, { recursive: true });
  for (const f of ["vision_wasm_internal.js", "vision_wasm_internal.wasm", "vision_wasm_nosimd_internal.js", "vision_wasm_nosimd_internal.wasm"]) {
    await copyFile(join(root, "wasm", f), join(dest, f));
  }
  console.log("[mediapipe] copied the vision runtime to public/mediapipe/wasm");
} catch (e) {
  console.warn("[mediapipe] skipped the runtime copy:", e?.message ?? e);
}
