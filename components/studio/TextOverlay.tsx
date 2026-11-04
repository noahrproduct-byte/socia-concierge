"use client";

// On-screen text drawn by the one renderer (lib/textRender.ts) outside the
// Remotion composition: the Rate preview lays rendered layers over the
// <video>, and the preset picker shows each look as a thumbnail. The safe
// zone can be shown over either as a dashed box (a check for us, off by
// default; see useSafeZoneGuide).
import { useEffect, useState } from "react";
import { peekRendered, renderTextLayer, type RenderArgs, type RenderedText } from "@/lib/textRender";
import { safeZoneFor, TEXT_PRESETS, type TextPresetId } from "@/lib/textPresets";
import type { EdlText } from "@/lib/studioClips/types";

/** The rendered PNG for these inputs, once the fonts and the canvas are done; null until then. */
export function useRenderedText(a: RenderArgs | null): RenderedText | null {
  const key = a ? JSON.stringify([a.presetId, a.text, a.slot ?? null, a.width, a.height]) : null;
  const [out, setOut] = useState<RenderedText | null>(null);
  useEffect(() => {
    if (!a || !a.text.trim() || !a.width || !a.height) { setOut(null); return; }
    let alive = true;
    const done = peekRendered(a);
    (done ?? renderTextLayer(a)).then((r) => { if (alive) setOut(r); }).catch(() => { if (alive) setOut(null); });
    return () => { alive = false; };
    // The key captures every input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return out;
}

const GUIDE_KEY = "socia.safeZoneGuide";

/**
 * A dev check: show the Instagram/TikTok safe zone over the preview. On in
 * development, or anywhere once `localStorage["socia.safeZoneGuide"] = "1"`.
 * Never on for a person by default.
 */
export function useSafeZoneGuide(): [boolean, (on: boolean) => void, boolean] {
  const [available, setAvailable] = useState(false);
  const [on, setOn] = useState(false);
  useEffect(() => {
    let stored: string | null = null;
    try { stored = window.localStorage.getItem(GUIDE_KEY); } catch { /* private mode */ }
    const dev = process.env.NODE_ENV !== "production";
    setAvailable(dev || stored != null);
    setOn(stored === "1");
  }, []);
  const set = (v: boolean) => { setOn(v); try { window.localStorage.setItem(GUIDE_KEY, v ? "1" : "0"); } catch { /* ignore */ } };
  return [on && available, set, available];
}

/** The safe zone as a dashed box over a frame of this size (the parent is the frame, position: relative). */
export function SafeZoneGuide({ width, height }: { width: number; height: number }) {
  if (!width || !height) return null;
  const z = safeZoneFor(width, height);
  const pct = (n: number, of: number) => `${(n / of) * 100}%`;
  return (
    <div className="txo-guide" aria-hidden style={{ left: pct(z.x, width), top: pct(z.y, height), width: pct(z.width, width), height: pct(z.height, height) }}>
      <span>Safe zone</span>
    </div>
  );
}

function OverlayImage({ layer, width, height }: { layer: EdlText; width: number; height: number }) {
  const presetId = (layer.presetId && TEXT_PRESETS[layer.presetId] ? layer.presetId : null) as TextPresetId | null;
  const r = useRenderedText(presetId ? { presetId, text: layer.text, slot: layer.slot, width, height } : null);
  if (!r || !r.layout.fits) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="txo-layer" src={r.url} alt="" draggable={false} />;
}

/**
 * The text layers live at time `t`, drawn over a frame of `width`×`height`
 * (the parent fills that frame). No animation here: the Rate preview shows
 * where a line sits, the composition plays it in.
 */
export function TextOverlayPreview({ layers, t, width, height, guide }: { layers: EdlText[]; t: number; width: number; height: number; guide?: boolean }) {
  if (!width || !height) return null;
  return (
    <>
      {layers.filter((l) => l.text.trim() && t >= l.at && t < l.end).map((l) => <OverlayImage key={l.id} layer={l} width={width} height={height} />)}
      {guide && <SafeZoneGuide width={width} height={height} />}
    </>
  );
}

/** Thumbnails are drawn at half the reference size, then shown small, so the type stays crisp. */
const THUMB = { width: 540, height: 960 } as const;

/** One preset's look, as the picker shows it: its sample line on a dark frame. */
export function PresetThumb({ presetId, text }: { presetId: TextPresetId; text?: string }) {
  const preset = TEXT_PRESETS[presetId];
  const r = useRenderedText({ presetId, text: text?.trim() || preset.sample, width: THUMB.width, height: THUMB.height });
  return (
    <span className="txp-thumb" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {r && r.layout.fits ? <img src={r.url} alt="" draggable={false} /> : null}
    </span>
  );
}
