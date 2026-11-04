"use client";

// A check page for the Improve walkthrough (development only; app/dev/improve-lab):
// the real ImprovePanel on an example analysis, beside a player, with frames
// sampled from a video served from /public (?video=) or dropped in. The
// numbers in the example analysis are illustrative, not measured.
import { useEffect, useRef, useState } from "react";
import { ImprovePanel, type Working } from "./StudioPanels";
import { TextOverlayPreview } from "./TextOverlay";
import { extractFrames, type Frames, type StudioAnalysis } from "@/lib/studio";

const ANALYSIS: StudioAnalysis = {
  kind: "video", durationSec: 20.5, score: { overall: 64, label: "Needs work before posting" }, categories: [],
  observed: { subjectAppearsAt: 0, faceSeen: false, onScreenText: false, ctaDetected: false, summary: "A title card opens on a quiet street scene; the voice starts at 2.4 s." },
  markers: [], segments: [],
  topFixes: [
    { title: "The opening has no spoken or written hook", observed: "The first card is a label, not a reason to keep watching; the voice starts at 2.4 s.", suggestion: "Put the hook on screen in the first three seconds, in the words you already say.", kind: "opening", t: 0, apply: { field: "hook", value: "A free AI agency with 270 agents" } },
    { title: "The ending asks for nothing", observed: "The last four seconds show the sign and stop; no next step is spoken or shown.", suggestion: "Close on the ask, on screen, with the track landing under it.", kind: "ending", t: 17, apply: { field: "cta", value: "Comment AGENCY and I'll send the repo" } },
    { title: "The voice sits low against the music", observed: "Measured −27 dBFS over the spoken parts, with a steady bed under it.", suggestion: "Even out the level and bring the bed down under the voice.", kind: "audio", t: 2.5, apply: null },
  ],
  hooks: { current: "A free AI agency with 270 agents", options: [] }, cta: { current: "Comment AGENCY and I'll send the repo", options: [] }, onScreenText: [],
  cuts: { currentSec: 20.5, suggestedSec: 17.8, edits: [{ type: "remove", start: 8.1, end: 9.9, reason: "the counter holds with nothing said" }, { type: "trim", start: 14, end: 15.3, reason: "the install screen lingers" }], note: "" },
  audio: { observed: "", direction: { style: "", bpm: "", texture: "", why: "" }, alternative: { style: "", bpm: "", texture: "", why: "" } },
  platformFit: [], compare: null, niche: null, caption: { current: null, suggestion: null },
  meta: { frames: 8, hadTranscript: true, analyzedAt: "", version: 1, autoTranscript: true, audioMeasured: true },
  measuredAudio: { durationSec: 20.5, hasAudio: true, levelDb: -27, peakDb: -4, level: "quiet", audibleRatio: 0.9, silentOpeningSec: 0, longestPauseSec: 1.8, pauses: [{ start: 8.1, end: 9.9 }], bpm: null, musicLikely: true } as StudioAnalysis["measuredAudio"],
};

export default function ImproveLab() {
  const video = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [frames, setFrames] = useState<Frames | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [t, setT] = useState(0);
  const [w, setW] = useState<Working>({ hook: ANALYSIS.hooks.current ?? "", cta: ANALYSIS.cta.current ?? "", caption: "", onscreen: [], layers: [], platform: "Instagram Reels", goal: null, cover: null, audioChosen: false });
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { const q = new URLSearchParams(window.location.search).get("video"); if (q) setUrl(q); }, []);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    extractFrames(url, () => null).then((f) => { if (alive) setFrames(f); }).catch(() => null);
    return () => { alive = false; };
  }, [url]);
  const seek = (s: number) => { const v = video.current; if (v) { v.currentTime = s; setT(s); } };
  return (
    <div className="txlab">
      <h1>Improve walkthrough lab</h1>
      <p className="ov-source">Development only. The real Improve panel on an example analysis (illustrative numbers). The editor hand-off is replaced by a note here.</p>
      <div className="imw-grid">
        <div className="imw-player ov-card">
          {url ? (
            <div style={{ position: "relative" }}>
              <video ref={video} src={url} playsInline muted controls onTimeUpdate={(e) => setT(e.currentTarget.currentTime)} onLoadedMetadata={(e) => setSize({ width: e.currentTarget.videoWidth, height: e.currentTarget.videoHeight })} />
              {size && <div className="stp-overlay" style={{ inset: 0 }}><TextOverlayPreview layers={w.layers} t={t} width={size.width} height={size.height} /></div>}
            </div>
          ) : (
            <label className="imw-drop"><span>Drop a video</span><input type="file" accept="video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setUrl(URL.createObjectURL(f)); }} /></label>
          )}
          {note && <p className="ov-source">{note}</p>}
        </div>
        <div className="imw-side">
          <ImprovePanel a={ANALYSIS} w={w} seek={seek} playT={t} thumbs={frames?.thumbs ?? []} durationSec={frames?.duration ?? ANALYSIS.durationSec ?? 20} frame={size} canHandoff={Boolean(url)}
            onFix={(m, o) => setNote(`Would open the editor: ${m.capability} at ${m.t}s, options ${JSON.stringify(o)}`)} onCaption={() => setNote("Would switch to the Caption tab")}
            onProposed={(lines) => setW((c) => ({ ...c, layers: lines.map((l) => ({ id: l.id, at: l.at, end: l.end, text: l.text, role: "mid" as const, presetId: l.presetId })) }))} />
        </div>
      </div>
    </div>
  );
}
