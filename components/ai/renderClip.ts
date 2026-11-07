"use client";

// Render one of SOCIA's own clips to a vertical MP4 in this browser, with the
// same composition Content Studio exports with (ClipComposition and
// @remotion/web-renderer): one cut of the source video, the 9:16 crop the
// person placed, captions from the real transcript and, when asked, the
// clip's title on screen for its first seconds. Nothing is sent to a render
// service; the file is uploaded once it is made.
import { ClipComposition } from "@/components/studio/remotion/ClipComposition";
import { timeline } from "@/lib/studioClips/timeline";
import { OUTPUT, type BuildSource, type Edl } from "@/lib/studioClips/types";
import { CAPCUT_STYLE } from "@/lib/studioClips/style";
import type { ClipRender } from "@/lib/clipper/server";

const SOURCE_ID = "source";

/** The one-cut cut list for a clip: Content Studio's format, so its renderer and captions apply as they are. */
export function clipEdl(r: ClipRender, title: string | null, headline: boolean): Edl {
  const inS = r.startMs / 1000, outS = r.endMs / 1000;
  const len = outS - inS;
  return {
    version: 1, fps: OUTPUT.fps, width: OUTPUT.width, height: OUTPUT.height,
    targetSec: { min: len, max: len },
    segments: [{ id: "cut-1", clipId: SOURCE_ID, in: inS, out: outS, role: "body", note: "", frame: { zoom: 1, x: r.cropX, y: 0.5 } }],
    text: headline && title ? [{ id: "title", at: 0, end: Math.min(3, len), text: title.slice(0, 80), role: "opening" }] : [],
    captions: r.captions && r.words.length ? { source: "transcript" } : null,
    enhance: [], audio: [], cta: null, music: null, caption: "", notes: [],
    // Noah's rule for every new cut: CapCut's look. Large captions, since a talk is carried by its words.
    style: { ...CAPCUT_STYLE, captions: { ...CAPCUT_STYLE.captions, size: "l" } },
  };
}

export function clipSource(r: ClipRender, size: { width: number | null; height: number | null }, durationSec: number): BuildSource {
  return { clipId: SOURCE_ID, position: 0, name: "Source", url: r.sourceUrl, thumb: null, durationSec, width: size.width, height: size.height, words: r.words, moments: [] };
}

export async function renderClip(
  r: ClipRender,
  opts: { title: string | null; headline: boolean; size: { width: number | null; height: number | null }; sourceSec: number; signal?: AbortSignal; onProgress?: (f: number) => void },
): Promise<{ blob: Blob; durationSec: number }> {
  const edl = clipEdl(r, opts.title, opts.headline);
  const tl = timeline(edl);
  const sources = { [SOURCE_ID]: clipSource(r, opts.size, opts.sourceSec) };
  const props = { edl, sources, captionsOn: Boolean(edl.captions), musicUrl: null, cleanAudio: {} };
  const { renderMediaOnWeb } = await import("@remotion/web-renderer");
  const { getBlob } = await renderMediaOnWeb({
    composition: { id: "socia-clipper-clip", component: ClipComposition, durationInFrames: tl.durationFrames, fps: OUTPUT.fps, width: edl.width, height: edl.height, defaultProps: props, calculateMetadata: null },
    inputProps: props,
    container: "mp4",
    // Medium: a clip's file has to upload, often over a slow connection, and platforms compress it again anyway.
    videoBitrate: "medium",
    pageResponsiveness: "medium",
    signal: opts.signal,
    onProgress: ({ progress }) => opts.onProgress?.(progress),
  });
  return { blob: await getBlob(), durationSec: tl.durationSec };
}
