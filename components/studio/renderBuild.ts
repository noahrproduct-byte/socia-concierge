"use client";

// Render one build to an MP4 in this browser (WebCodecs, @remotion/web-renderer),
// exactly as the editor's Export does: the same composition, the same EDL.
// Used by Make and schedule to make a whole project's videos in a row.
import { ClipComposition } from "./remotion/ClipComposition";
import { timeline } from "@/lib/studioClips/timeline";
import { OUTPUT, type BuildPlayerData, type BuildSource } from "@/lib/studioClips/types";

/** Why this browser can't render, or null when it can. */
export async function renderBlocker(width: number, height: number): Promise<string | null> {
  const { canRenderMediaOnWeb } = await import("@remotion/web-renderer");
  const check = await canRenderMediaOnWeb({ width, height, container: "mp4" });
  if (check.canRender) return null;
  const why = check.issues.filter((i) => i.severity === "error").map((i) => i.message).join(" ");
  return `This browser can't render video: ${why || "WebCodecs is unavailable."} Open SOCIA in Chrome or Edge on a computer to make the videos.`;
}

export async function renderBuild(data: BuildPlayerData, opts: { signal?: AbortSignal; onProgress?: (f: number) => void } = {}): Promise<{ blob: Blob; durationSec: number; width: number; height: number }> {
  const edl = data.build.edl;
  if (!edl) throw new Error("This video has no cut yet.");
  const tl = timeline(edl);
  const sources = Object.fromEntries(data.sources.map((s) => [s.clipId, s])) as Record<string, BuildSource>;
  const missing = edl.segments.filter((s) => !sources[s.clipId]).length;
  if (missing) throw new Error("Some of its clips have expired from storage, so it can't be made.");
  const { renderMediaOnWeb } = await import("@remotion/web-renderer");
  const props = { edl, sources, captionsOn: Boolean(edl.captions) };
  const { getBlob } = await renderMediaOnWeb({
    composition: { id: "socia-clip-build", component: ClipComposition, durationInFrames: tl.durationFrames, fps: OUTPUT.fps, width: edl.width, height: edl.height, defaultProps: props, calculateMetadata: null },
    inputProps: props,
    container: "mp4",
    videoBitrate: "high",
    pageResponsiveness: "medium",
    signal: opts.signal,
    onProgress: ({ progress }) => opts.onProgress?.(progress),
  });
  return { blob: await getBlob(), durationSec: tl.durationSec, width: edl.width, height: edl.height };
}

/** The words spoken inside the cut, in order: what the caption writer hears. */
export function spokenText(data: BuildPlayerData): string | null {
  const edl = data.build.edl;
  if (!edl) return null;
  const words = new Map(data.sources.map((s) => [s.clipId, s.words ?? []]));
  const parts = edl.segments.flatMap((s) => (words.get(s.clipId) ?? []).filter((w) => w.startMs / 1000 >= s.in && w.endMs / 1000 <= s.out).map((w) => w.text));
  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 4000) : null;
}
