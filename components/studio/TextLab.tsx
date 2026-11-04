"use client";

// A check page for text presets (development only; app/dev/text-lab). The
// same lines are shown three ways, so a difference would be visible at once:
// the renderer's PNG laid over a frame (what Rate shows), the Remotion Player
// (what the Video editor shows) and a real browser export (what is made).
// Any aspect, the safe zone on or off, the six presets, long, emoji and
// Arabic lines. Nothing here is reachable in production.
import { useMemo, useState } from "react";
import { Player } from "@remotion/player";
import TextLayersPanel, { newTextLayer } from "./TextLayersPanel";
import { TextOverlayPreview } from "./TextOverlay";
import { ClipComposition } from "./remotion/ClipComposition";
import { ASPECTS, OUTPUT, type Edl, type EdlText } from "@/lib/studioClips/types";

const DURATION = 6;

/** Preset, words, start and end: at most one line per slot at any moment, so nothing overlaps in the lab. */
const SAMPLES: [NonNullable<EdlText["presetId"]>, string, number, number][] = [
  ["hook_title", "Wait for the cheese pull", 0, 6],
  ["callout_box", "Only 20 made a day", 0, 3],
  ["big_stat", "200+\nburgers every Friday", 3, 6],
  ["caption_bar", "Open every day from 7am, downtown", 0, 3],
  ["lower_third", "Burger a la smash · since 2019", 3, 6],
];

type Phase = { state: "idle" } | { state: "rendering"; progress: number } | { state: "done"; url: string; bytes: number } | { state: "error"; message: string };

export default function TextLab() {
  const [aspect, setAspect] = useState(0);
  const [layers, setLayers] = useState<EdlText[]>(() => SAMPLES.map(([p, text, at, end]) => ({ ...newTextLayer(p, DURATION, at, text), end })));
  const [t, setT] = useState(1);
  const [guide, setGuide] = useState(true);
  const [phase, setPhase] = useState<Phase>({ state: "idle" });
  const { width, height } = ASPECTS[aspect];
  const edl = useMemo<Edl>(() => ({ version: 1, fps: 30, width, height, targetSec: { min: 1, max: DURATION }, segments: [], text: layers, captions: null, enhance: [], audio: [], cta: null, music: null, caption: "", notes: [] }), [width, height, layers]);
  const frames = DURATION * OUTPUT.fps;

  const exportTest = async () => {
    setPhase({ state: "rendering", progress: 0 });
    try {
      const { canRenderMediaOnWeb, renderMediaOnWeb } = await import("@remotion/web-renderer");
      const check = await canRenderMediaOnWeb({ width, height, container: "mp4" });
      if (!check.canRender) { setPhase({ state: "error", message: check.issues.map((i) => i.message).join(" ") || "This browser can't render video." }); return; }
      const props = { edl, sources: {}, captionsOn: false };
      const { getBlob } = await renderMediaOnWeb({
        composition: { id: "socia-text-lab", component: ClipComposition, durationInFrames: frames, fps: OUTPUT.fps, width, height, defaultProps: props, calculateMetadata: null },
        inputProps: props, container: "mp4", videoBitrate: "medium", pageResponsiveness: "medium",
        onProgress: ({ progress }) => setPhase({ state: "rendering", progress }),
      });
      const blob = await getBlob();
      setPhase({ state: "done", url: URL.createObjectURL(blob), bytes: blob.size });
    } catch (e) {
      setPhase({ state: "error", message: (e as Error)?.message ?? "Render failed." });
    }
  };

  return (
    <div className="txlab">
      <h1>Text presets lab</h1>
      <p className="ov-source">Development only. Left: the renderer over a frame (Rate preview). Middle: the Remotion Player (Video editor). Right: a real export of the same lines.</p>
      <div className="txlab-controls">
        <label>Aspect <select value={aspect} onChange={(e) => setAspect(Number(e.target.value))}>{ASPECTS.map((a, i) => <option key={a.id} value={i}>{a.label} ({a.width}×{a.height})</option>)}</select></label>
        <label><input type="checkbox" checked={guide} onChange={(e) => setGuide(e.target.checked)} /> Safe zone</label>
        <label>Time {t.toFixed(1)}s <input type="range" min={0} max={DURATION} step={0.1} value={t} onChange={(e) => setT(Number(e.target.value))} /></label>
        <button type="button" className="ov-btn primary small" disabled={phase.state === "rendering"} onClick={exportTest}>{phase.state === "rendering" ? `Rendering ${Math.round(phase.progress * 100)}%` : "Export 6 s test"}</button>
      </div>
      <div className="txlab-grid">
        <div className="txlab-col">
          <b>Renderer over a frame</b>
          <div className="txlab-frame" style={{ aspectRatio: `${width} / ${height}` }}>
            <TextOverlayPreview layers={layers} t={t} width={width} height={height} guide={guide} />
          </div>
        </div>
        <div className="txlab-col">
          <b>Remotion Player</b>
          <div className="txlab-frame" style={{ aspectRatio: `${width} / ${height}` }}>
            <Player component={ClipComposition} inputProps={{ edl, sources: {}, captionsOn: false, safeZoneGuide: guide }} durationInFrames={frames} fps={OUTPUT.fps} compositionWidth={width} compositionHeight={height} controls acknowledgeRemotionLicense style={{ width: "100%", height: "100%" }} />
          </div>
        </div>
        <div className="txlab-col">
          <b>Browser export</b>
          <div className="txlab-frame" style={{ aspectRatio: `${width} / ${height}` }}>
            {phase.state === "done" && <video src={phase.url} controls playsInline style={{ width: "100%", height: "100%" }} />}
            {phase.state === "error" && <p className="txp-problem">{phase.message}</p>}
          </div>
          {phase.state === "done" && <small className="ov-source">{(phase.bytes / 1024).toFixed(0)} KB</small>}
        </div>
      </div>
      <div className="txlab-panel">
        <TextLayersPanel layers={layers} onChange={setLayers} durationSec={DURATION} frame={{ width, height }} playhead={() => t} onOpen={(l) => setT(l.at + 0.1)} />
      </div>
    </div>
  );
}
