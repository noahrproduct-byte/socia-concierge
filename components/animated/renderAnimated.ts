"use client";

// Render an animated "Make it with AI" video to a vertical MP4 in this browser
// with @remotion/web-renderer, the same way Content Studio exports. Nothing is
// sent to a render service; the file is uploaded once it is made.
import { AnimatedComposition } from "./AnimatedComposition";
import { ANIMATED_FPS, ANIMATED_SIZE, specTimeline, type AnimatedSpec } from "@/lib/animated/spec";

export async function renderAnimated(spec: AnimatedSpec, opts: { signal?: AbortSignal; onProgress?: (f: number) => void } = {}): Promise<{ blob: Blob; durationSec: number }> {
  const total = specTimeline(spec).total;
  const props = { spec };
  const { renderMediaOnWeb } = await import("@remotion/web-renderer");
  const { getBlob } = await renderMediaOnWeb({
    composition: { id: "socia-animated", component: AnimatedComposition, durationInFrames: total, fps: ANIMATED_FPS, width: ANIMATED_SIZE.width, height: ANIMATED_SIZE.height, defaultProps: props, calculateMetadata: null },
    inputProps: props,
    container: "mp4",
    videoBitrate: "medium",
    pageResponsiveness: "medium",
    signal: opts.signal,
    onProgress: ({ progress }) => opts.onProgress?.(progress),
  });
  return { blob: await getBlob(), durationSec: total / ANIMATED_FPS };
}
