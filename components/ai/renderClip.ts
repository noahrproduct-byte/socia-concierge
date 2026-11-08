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
import { rankingOverlay, rankingMs, type Ranking } from "@/lib/clipper/ranking";
import type { CropKey } from "@/lib/clipper/reframe";

const SOURCE_ID = "source";

// Noah's rule for every new cut: CapCut's look. One line of a few words, in the middle of the picture below the face, like the clips he studied.
const CLIP_STYLE = { ...CAPCUT_STYLE, captions: { ...CAPCUT_STYLE.captions, size: "m" as const, position: "lower" as const } };

/** The most words on screen at once. */
const CAPTION_WORDS = 4;

const onBlack = (k: CropKey) => k.s < 0.95;

/** The headline: up for the whole clip when it sits on the black above the picture, only the opening over a full-height crop, where it would cover the face. */
const headlineLine = (title: string, len: number, whole: boolean): Edl["text"][number] => ({ id: "title", at: 0, end: whole ? len : Math.min(3, len), text: title.slice(0, 80), role: "opening", presetId: "clip_headline" });

/** The one-cut cut list for a clip: Content Studio's format, so its renderer and captions apply as they are. */
export function clipEdl(r: ClipRender, title: string | null, headline: boolean): Edl {
  const inS = r.startMs / 1000, outS = r.endMs / 1000;
  const len = outS - inS;
  return {
    version: 1, fps: OUTPUT.fps, width: OUTPUT.width, height: OUTPUT.height,
    targetSec: { min: len, max: len },
    segments: [{ id: "cut-1", clipId: SOURCE_ID, in: inS, out: outS, role: "body", note: "", frame: { zoom: 1, x: r.cropX, y: 0.5, ...(r.cropPath?.length ? { path: r.cropPath } : {}) } }],
    text: headline && title ? [headlineLine(title, len, Boolean(r.cropPath?.length && r.cropPath.every(onBlack)))] : [],
    captions: r.captions && r.words.length ? { source: "transcript" } : null,
    enhance: [], audio: [], cta: null, music: null, caption: "", notes: [],
    style: CLIP_STYLE,
  };
}

/** A ranking's or trailer's cut list: its moments joined with hard cuts in playing order. A ranking's title and list are drawn by the composition. */
export function rankingEdl(r: ClipRender, ranking: Ranking, paths: (CropKey[] | null)[], headline = false): Edl {
  const len = rankingMs(ranking) / 1000;
  return {
    version: 1, fps: OUTPUT.fps, width: OUTPUT.width, height: OUTPUT.height,
    targetSec: { min: len, max: len },
    segments: ranking.items.map((m, i) => ({ id: `rank-${m.rank}`, clipId: SOURCE_ID, in: m.startMs / 1000, out: m.endMs / 1000, role: "body", note: "", frame: { zoom: 1, x: r.cropX, y: 0.5, ...(paths[i]?.length ? { path: paths[i]! } : {}) } })),
    text: ranking.kind === "trailer" && headline ? [headlineLine(ranking.title, len, paths.length > 0 && paths.every((p) => Boolean(p?.length && p.every(onBlack))))] : [],
    captions: r.captions && r.words.length ? { source: "transcript" } : null,
    enhance: [], audio: [], cta: null, music: null, caption: "", notes: [],
    style: CLIP_STYLE,
  };
}

export function clipSource(r: ClipRender, size: { width: number | null; height: number | null }, durationSec: number): BuildSource {
  return { clipId: SOURCE_ID, position: 0, name: "Source", url: r.sourceUrl, thumb: null, durationSec, width: size.width, height: size.height, words: r.words, moments: [] };
}

export async function renderClip(
  r: ClipRender,
  opts: { title: string | null; headline: boolean; size: { width: number | null; height: number | null }; sourceSec: number; paths?: (CropKey[] | null)[]; signal?: AbortSignal; onProgress?: (f: number) => void },
): Promise<{ blob: Blob; durationSec: number }> {
  const edl = r.ranking ? rankingEdl(r, r.ranking, opts.paths ?? [], opts.headline) : clipEdl(r, opts.title, opts.headline);
  const tl = timeline(edl);
  const sources = { [SOURCE_ID]: clipSource(r, opts.size, opts.sourceSec) };
  const props = { edl, sources, captionsOn: Boolean(edl.captions), musicUrl: null, cleanAudio: {}, captionWords: CAPTION_WORDS, ranking: r.ranking && r.ranking.kind !== "trailer" ? rankingOverlay(r.ranking) : undefined, emphasis: r.emphasis ?? [] };
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
