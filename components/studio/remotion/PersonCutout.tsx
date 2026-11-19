"use client";

// The person talking, cut out of their own shot and drawn again above a
// graphic, so the graphic sits behind them (lib/studioClips/matte.ts). The
// frame comes from the same decoder in the Player and in the export
// (@remotion/media, headless), is read by the segmenter as it arrives and is
// drawn before the frame is shown or captured, so both draw the same picture.
// Where no one is found, or the segmenter can't run, nothing is drawn and the
// graphic simply stays in front.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { continueRender, delayRender, useCurrentFrame } from "remotion";
import { Video } from "@remotion/media";
import type { ImageSegmenter } from "@mediapipe/tasks-vision";
import { drawPerson, loadSegmenter, makeMatte, type Matte } from "@/lib/studioClips/matte";

const sizeOf = (f: CanvasImageSource): { w: number; h: number } => {
  const a = f as { displayWidth?: number; displayHeight?: number; videoWidth?: number; videoHeight?: number; width?: number | SVGAnimatedLength; height?: number | SVGAnimatedLength };
  const w = a.displayWidth ?? a.videoWidth ?? (typeof a.width === "number" ? a.width : 0);
  const h = a.displayHeight ?? a.videoHeight ?? (typeof a.height === "number" ? a.height : 0);
  return { w, h };
};

export function PersonCutout({ src, trimBefore, frames, style, filter, edge }: {
  src: string;
  /** the clip frame this run starts on, as the shot under it */
  trimBefore: number;
  frames: number;
  /** the same box the shot under it is drawn in */
  style: React.CSSProperties;
  /** the cut's look as a canvas filter, so the person matches the picture behind */
  filter?: string;
  /** an edge drawn around the person (a paper cut-out's white edge, a sketch's wobbling line) */
  edge?: { width: number; color: string; wobble?: boolean };
}) {
  // A wobbling edge is redrawn every third frame, like a line drawn again by hand.
  const boil = Math.floor(useCurrentFrame() / 3);
  const edgeRef = useRef<{ width: number; color: string; wobble?: number } | undefined>(undefined);
  edgeRef.current = edge ? { width: edge.width, color: edge.color, ...(edge.wobble ? { wobble: boil } : {}) } : undefined;
  const canvas = useRef<HTMLCanvasElement>(null);
  const matte = useRef<Matte | null>(null);
  const [seg, setSeg] = useState<ImageSegmenter | null>(null);
  // The frame waits for the segmenter (a render never captures a frame it was not ready for).
  useEffect(() => {
    const handle = delayRender("person segmenter", { timeoutInMilliseconds: 60_000 });
    let alive = true;
    loadSegmenter().then((s) => { if (alive) setSeg(s); }).finally(() => continueRender(handle));
    return () => { alive = false; };
  }, []);
  const onVideoFrame = useCallback((frame: CanvasImageSource) => {
    const c = canvas.current;
    if (!c || !seg) return;
    const { w, h } = sizeOf(frame);
    if (!w || !h) return;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; matte.current = null; }
    matte.current ??= makeMatte(w, h);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    try { drawPerson(seg, matte.current, frame, ctx, filter, edgeRef.current); } catch { ctx.clearRect(0, 0, w, h); }
  }, [seg, filter]);
  return (
    <>
      {seg && <Video src={src} trimBefore={trimBefore} durationInFrames={frames} muted volume={0} headless onVideoFrame={onVideoFrame} />}
      <canvas ref={canvas} style={{ ...style, pointerEvents: "none" }} />
    </>
  );
}
