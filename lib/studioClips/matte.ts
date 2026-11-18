"use client";
// The presenter's outline, found in this browser (MediaPipe's selfie
// segmenter, a small model that runs on the graphics card): for a frame of
// video it answers how sure it is, pixel by pixel, that a person is there.
// The editor uses it to put a graphic behind the person talking
// (components/studio/remotion/PersonCutout.tsx). Nothing is uploaded.
// The runtime is self-hosted (scripts/copy-mediapipe.mjs); the model is
// public/mediapipe/selfie_segmenter.tflite, or NEXT_PUBLIC_SEGMENTER_MODEL.
// A browser that can't run it answers null and the graphic stays in front.
import type { ImageSegmenter } from "@mediapipe/tasks-vision";

const WASM = "/mediapipe/wasm";
const LOCAL_MODEL = "/mediapipe/selfie_segmenter.tflite";
/** Development only, while the model file has not been put in public/: Google's own copy. */
const DEV_MODEL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";
/** The frame is read at this width: enough for a clean outline, quick enough for every frame. */
export const MATTE_WIDTH = 384;
/** Under LOW a pixel is background, over HIGH it is the person; between, the edge softens. */
const LOW = 0.35, HIGH = 0.7;

let loading: Promise<ImageSegmenter | null> | null = null;

async function modelUrl(): Promise<string> {
  const set = process.env.NEXT_PUBLIC_SEGMENTER_MODEL;
  if (set) return set;
  if (process.env.NODE_ENV !== "development") return LOCAL_MODEL;
  const here = await fetch(LOCAL_MODEL, { method: "HEAD" }).then((r) => r.ok).catch(() => false);
  return here ? LOCAL_MODEL : DEV_MODEL;
}

/** The segmenter, loaded once per tab. null when this browser can't run it or its files can't be read. */
export function loadSegmenter(): Promise<ImageSegmenter | null> {
  loading ??= (async () => {
    try {
      const vision = await import("@mediapipe/tasks-vision");
      const files = await vision.FilesetResolver.forVisionTasks(WASM);
      const make = (delegate: "GPU" | "CPU") => vision.ImageSegmenter.createFromOptions(files, { baseOptions: { modelAssetPath: url, delegate }, runningMode: "IMAGE", outputCategoryMask: false, outputConfidenceMasks: true });
      const url = await modelUrl();
      return await make("GPU").catch(() => make("CPU"));
    } catch {
      return null;
    }
  })();
  return loading;
}

export type Matte = { small: HTMLCanvasElement | OffscreenCanvas; mask: HTMLCanvasElement | OffscreenCanvas };
const canvasOf = (w: number, h: number): HTMLCanvasElement | OffscreenCanvas => {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas"); c.width = w; c.height = h; return c;
};
/** The two working canvases for a source of this size: the frame made small, and the mask the segmenter gives for it. */
export function makeMatte(width: number, height: number): Matte {
  const w = Math.min(MATTE_WIDTH, width), h = Math.max(1, Math.round((w * height) / width));
  return { small: canvasOf(w, h), mask: canvasOf(w, h) };
}

/** How sure the segmenter is, as the opacity of a mask pixel (0 to 255), with a soft edge between LOW and HIGH. */
export function alphaOf(confidence: number): number {
  const t = Math.min(1, Math.max(0, (confidence - LOW) / (HIGH - LOW)));
  return Math.round(t * t * (3 - 2 * t) * 255);
}

/**
 * The person in `frame`, drawn onto `out` at its own size with everything else
 * left clear. Synchronous, so a render can call it on the frame it is about to
 * capture. Returns the share of the picture that is a person (0 when no one is found).
 */
export function drawPerson(seg: ImageSegmenter, matte: Matte, frame: CanvasImageSource, out: CanvasRenderingContext2D, filter?: string): number {
  const { small, mask } = matte;
  const sctx = small.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  const mctx = mask.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  const W = out.canvas.width, H = out.canvas.height;
  out.clearRect(0, 0, W, H);
  if (!sctx || !mctx) return 0;
  sctx.drawImage(frame, 0, 0, small.width, small.height);
  let share = 0;
  seg.segment(small as unknown as HTMLCanvasElement, (res) => {
    const m = res.confidenceMasks?.[0];
    if (!m) return;
    const conf = m.getAsFloat32Array();
    const img = mctx.createImageData(m.width, m.height);
    let on = 0;
    for (let i = 0; i < conf.length; i++) {
      const a = alphaOf(conf[i]);
      img.data[i * 4 + 3] = a;
      if (a > 127) on += 1;
    }
    share = conf.length ? on / conf.length : 0;
    if (mask.width !== m.width || mask.height !== m.height) { mask.width = m.width; mask.height = m.height; }
    mctx.putImageData(img, 0, 0);
  });
  if (share <= 0) return 0;
  // The frame, in the cut's own look, kept only where the mask says a person is.
  out.save();
  out.filter = filter ?? "none";
  out.drawImage(frame, 0, 0, W, H);
  out.filter = "none";
  out.globalCompositeOperation = "destination-in";
  out.imageSmoothingEnabled = true;
  out.imageSmoothingQuality = "high";
  out.drawImage(mask as unknown as CanvasImageSource, 0, 0, W, H);
  out.restore();
  return share;
}
