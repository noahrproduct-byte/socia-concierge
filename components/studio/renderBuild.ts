"use client";

// Render one build to an MP4 in this browser (WebCodecs, @remotion/web-renderer),
// exactly as the editor's Export does: the same composition, the same EDL.
// Used by Make and schedule to make a whole project's videos in a row.
import { ClipComposition } from "./remotion/ClipComposition";
import { timeline } from "@/lib/studioClips/timeline";
import { cleanSounds } from "@/lib/studioClips/cleanSound";
import { OUTPUT, type BuildPlayerData, type BuildSource } from "@/lib/studioClips/types";
import { renderFaults, type RenderReport } from "@/lib/studioClips/renderCheck";
import { inspectRender } from "@/lib/studioClips/inspectRender";
import { remotionLicenseKey } from "@/lib/studioClips/renderLicense";
import { exportProps } from "@/lib/studioClips/renderProps";
import { isGraphicsLost } from "@/lib/studioClips/renderErrors";
import { beatFromStart } from "@/lib/studioClips/beats";
import { beatOfTrack } from "@/lib/studioClips/beatClient";
import { CAPTION_MOTIONS } from "@/lib/studioClips/captionMotion";

/** Why this browser can't render, or null when it can. */
export async function renderBlocker(width: number, height: number): Promise<string | null> {
  const { canRenderMediaOnWeb } = await import("@remotion/web-renderer");
  const check = await canRenderMediaOnWeb({ width, height, container: "mp4" });
  if (check.canRender) return null;
  const why = check.issues.filter((i) => i.severity === "error").map((i) => i.message).join(" ");
  return `This browser can't render video: ${why || "WebCodecs is unavailable."} Open SOCIA in Chrome or Edge on a computer to make the videos.`;
}

/**
 * Render, then watch the file (lib/studioClips/renderCheck.ts): a render fault
 * gets one more try. `report` is what SOCIA saw in the video returned; the
 * caller decides what to do with a fault that is still there.
 */
export async function renderBuild(data: BuildPlayerData, opts: { signal?: AbortSignal; onProgress?: (f: number) => void } = {}): Promise<{ blob: Blob; durationSec: number; width: number; height: number; report: RenderReport | null }> {
  const edl = data.build.edl;
  if (!edl) throw new Error("This video has no cut yet.");
  const tl = timeline(edl);
  const sources = Object.fromEntries(data.sources.map((s) => [s.clipId, s])) as Record<string, BuildSource>;
  const missing = edl.segments.filter((s) => !sources[s.clipId]).length;
  if (missing) throw new Error("Some of its clips have expired from storage, so it can't be made.");
  const { renderMediaOnWeb } = await import("@remotion/web-renderer");
  // Background noise reduced first, as in the editor (clips that can't be cleaned keep their own sound).
  const cleanAudio = edl.cleanSound ? await cleanSounds(Array.from(new Set(edl.segments.map((s) => s.clipId))).map((id) => ({ clipId: id, url: sources[id].url }))) : {};
  const musicUrl = edl.soundtrack ? data.music?.[edl.soundtrack.trackId] ?? null : null;
  // The beat of the cut's music, measured as the editor measures it, for the caption style that lands on it: without
  // it this render timed those captions differently from the editor's preview and its own Export.
  const usesBeat = Boolean(edl.captions) && [edl.style?.captions.preset, ...Object.values(edl.captionOverrides ?? {}).map((o) => o.preset)].some((id) => CAPTION_MOTIONS.some((m) => m.id === id && m.beats));
  const measured = usesBeat && musicUrl ? await beatOfTrack(musicUrl).catch(() => null) : null;
  const beat = measured ? beatFromStart(measured, edl.soundtrack?.startSec ?? 0) : null;
  const props = exportProps({ edl, sources, musicUrl, voiceUrls: data.voice ?? {}, cleanAudio, watermarkUrl: edl.theme?.id === "socia-brand" ? "/brand/socia-mark.png" : null, beat });
  const once = async () => {
    const { getBlob } = await renderMediaOnWeb({
      composition: { id: "socia-clip-build", component: ClipComposition, durationInFrames: tl.durationFrames, fps: OUTPUT.fps, width: edl.width, height: edl.height, defaultProps: props, calculateMetadata: null },
      inputProps: props,
      container: "mp4",
      videoBitrate: "high",
      pageResponsiveness: "medium",
      signal: opts.signal,
      licenseKey: remotionLicenseKey(),
      onProgress: ({ progress }) => opts.onProgress?.(progress),
    });
    return getBlob();
  };
  const speaks = edl.segments.some((s) => sources[s.clipId]?.words?.length);
  const voiced = Boolean(edl.voiceover?.on && edl.voiceover.lines.some((l) => l.path && props.voiceUrls[l.path]));
  const expect = { sound: Boolean(props.musicUrl) || speaks || voiced, music: Boolean(props.musicUrl) };
  // The browser can drop its graphics context mid-render (other tabs playing video, a busy graphics card): the
  // render is tried once more after a breath before the person is told (lib/studioClips/renderErrors.ts).
  const withRetry = async () => {
    try { return await once(); } catch (e) {
      if (!isGraphicsLost(e) || opts.signal?.aborted) throw e;
      await new Promise((r) => setTimeout(r, 1200));
      return once();
    }
  };
  let blob = await withRetry();
  let report = await inspectRender(blob, edl, expect, opts.signal);
  if (renderFaults(report).length) {
    blob = await once();
    report = await inspectRender(blob, edl, expect, opts.signal);
  }
  return { blob, durationSec: tl.durationSec, width: edl.width, height: edl.height, report };
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
