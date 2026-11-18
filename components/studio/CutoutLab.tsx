"use client";

// A check page for the presenter cut-out (components/studio/remotion/PersonCutout.tsx):
// a talking clip from public/dev-talk.mp4 (not in the repository; put any
// vertical clip of a person there) with one graphic over it, in front of the
// person or behind them, in the Player and as a real browser render.
// The words here are stand-ins that only place the graphic. Development only.
import React, { useEffect, useMemo, useState } from "react";
import { Player } from "@remotion/player";
import { ClipComposition } from "./remotion/ClipComposition";
import { exportProps, previewProps } from "@/lib/studioClips/renderProps";
import { remotionLicenseKey } from "@/lib/studioClips/renderLicense";
import { timeline } from "@/lib/studioClips/timeline";
import { OUTPUT, type BuildSource, type Edl, type TranscriptWord } from "@/lib/studioClips/types";
import type { EdlScene } from "@/lib/studioClips/scenes";
import { DEFAULT_STYLE } from "@/lib/studioClips/style";

const URL_ = "/dev-talk.mp4";
const w = (text: string, s: number, e: number): TranscriptWord => ({ text, startMs: Math.round(s * 1000), endMs: Math.round(e * 1000), confidence: 1 });
const WORDS: TranscriptWord[] = [w("We", 2.4, 2.6), w("have", 2.6, 2.8), w("500", 2.8, 3.2), w("rugs", 3.2, 3.5), w("in", 3.5, 3.6), w("stock", 3.6, 4.0), w("today.", 4.0, 4.4)];
const SCENES: Record<string, EdlScene> = {
  stat: { id: "g1", kind: "stat", key: "talk@2800", dur: 3.4, text: "500", label: "rugs in stock", icon: "shop" },
  line: { id: "g1", kind: "line", key: "talk@2800", dur: 3.4, text: "Nobody else does it this way", icon: "star" },
  steps: { id: "g1", kind: "steps", key: "talk@2800", dur: 3.6, text: "", items: [{ key: "talk@2800", text: "pick your size" }, { key: "talk@3500", text: "pick your colour" }, { key: "talk@4000", text: "take it home" }] },
};

export default function CutoutLab() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [place, setPlace] = useState<"behind" | "over" | "split">("behind");
  const behind = place === "behind";
  // A stand-in logo, drawn here: a plain disc with a letter, not any real brand.
  const [logoOn, setLogoOn] = useState(false);
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => {
    const c = document.createElement("canvas"); c.width = c.height = 240;
    const x = c.getContext("2d"); if (!x) return;
    x.fillStyle = "#fff"; x.beginPath(); x.arc(120, 120, 112, 0, Math.PI * 2); x.fill();
    x.strokeStyle = "#111"; x.lineWidth = 8; x.beginPath(); x.arc(120, 120, 94, 0, Math.PI * 2); x.stroke();
    x.fillStyle = "#111"; x.font = "700 104px Arial, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("B", 120, 128);
    setLogo(c.toDataURL("image/png"));
  }, []);
  // The card lower in the frame (where it sits when captions are at the top), so it crosses the person.
  const [low, setLow] = useState(true);
  const [kind, setKind] = useState<keyof typeof SCENES>("stat");
  const [dur, setDur] = useState<number | null>(null);
  const [out, setOut] = useState<{ url: string; ms: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    const v = document.createElement("video");
    v.preload = "metadata"; v.src = URL_;
    v.onloadedmetadata = () => setDur(Math.floor(v.duration * 10) / 10);
    v.onerror = () => setDur(0);
  }, []);
  const data = useMemo(() => {
    if (!dur) return null;
    const source: BuildSource = { clipId: "talk", position: 0, name: "dev-talk.mp4", url: URL_, thumb: null, durationSec: dur, width: 1080, height: 1920, words: WORDS, moments: [] };
    const edl: Edl = {
      version: 1, fps: 30, width: OUTPUT.width, height: OUTPUT.height, targetSec: { min: 1, max: Math.ceil(dur) + 1 },
      segments: [{ id: "s1", clipId: "talk", in: 0, out: dur, role: "opener", note: "" }],
      text: [], captions: null, enhance: [], audio: [], cta: null, music: null, caption: "", notes: [],
      scenes: [SCENES[kind]], ...(place === "split" ? { scenesSplit: true as const } : behind ? { scenesBehind: true as const } : {}),
      ...(logoOn && logo ? { logo: { src: logo, name: "Your business", corner: true as const, ending: true as const } } : {}),
      ...(low ? { style: { ...DEFAULT_STYLE, captions: { ...DEFAULT_STYLE.captions, position: "top" as const } } } : {}),
    };
    return { edl, sources: { talk: source } };
  }, [dur, behind, place, kind, low, logoOn, logo]);
  if (!mounted) return <main style={{ minHeight: "100vh", background: "#08090c" }} />;
  const frames = data ? timeline(data.edl).durationFrames : 1;
  const inputs = data ? { edl: data.edl, sources: data.sources, musicUrl: null, voiceUrls: {}, cleanAudio: {}, watermarkUrl: null } : null;

  const render = async () => {
    if (!inputs) return;
    setBusy("0%"); setOut(null);
    const t0 = performance.now();
    try {
      const { renderMediaOnWeb } = await import("@remotion/web-renderer");
      const props = exportProps(inputs);
      const { getBlob } = await renderMediaOnWeb({
        composition: { id: "socia-cutout-lab", component: ClipComposition, durationInFrames: frames, fps: OUTPUT.fps, width: OUTPUT.width, height: OUTPUT.height, defaultProps: props, calculateMetadata: null },
        inputProps: props, container: "mp4", videoBitrate: "high", licenseKey: remotionLicenseKey(),
        onProgress: ({ progress }) => setBusy(`${Math.round(progress * 100)}%`),
      });
      const blob = await getBlob();
      setOut({ url: URL.createObjectURL(blob), ms: Math.round(performance.now() - t0) });
      setBusy(null);
    } catch (e) {
      setBusy(`failed: ${(e as Error)?.message ?? e}`);
    }
  };

  const btn = (on: boolean): React.CSSProperties => ({ height: 36, padding: "0 12px", borderRadius: 10, border: `1px solid ${on ? "#f4f5f7" : "rgba(255,255,255,0.14)"}`, background: "#111318", color: "#f4f5f7", font: "inherit", fontSize: 13, cursor: "pointer" });
  return (
    <main style={{ minHeight: "100vh", padding: "32px 24px 48px", background: "#08090c", color: "#f4f5f7", fontFamily: "Inter, system-ui, sans-serif" }}>
      <h1 style={{ margin: 0, fontSize: 28, lineHeight: "34px" }}>Graphics behind the person</h1>
      <p style={{ margin: "8px 0 20px", maxWidth: 680, fontSize: 14, lineHeight: "20px", color: "rgba(244,245,247,0.62)" }}>The clip is public/dev-talk.mp4. The words on the card are stand-ins that only place it. Left: the editor&apos;s preview. Right: the file a real render makes.</p>
      {dur === 0 && <p role="alert" style={{ color: "#ff7a7a" }}>No clip at public/dev-talk.mp4. Put a vertical clip of someone talking there and reload.</p>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        <button type="button" aria-pressed={behind} style={btn(behind)} onClick={() => setPlace("behind")}>Behind the person</button>
        <button type="button" aria-pressed={place === "over"} style={btn(place === "over")} onClick={() => setPlace("over")}>In front</button>
        <button type="button" aria-pressed={place === "split"} style={btn(place === "split")} onClick={() => setPlace("split")}>Split screen</button>
        <button type="button" aria-pressed={logoOn} style={btn(logoOn)} onClick={() => setLogoOn((v) => !v)}>Logo</button>
        {(Object.keys(SCENES) as (keyof typeof SCENES)[]).map((k) => <button key={k} type="button" aria-pressed={kind === k} style={btn(kind === k)} onClick={() => setKind(k)}>{k === "stat" ? "Figure" : k === "line" ? "Key line" : "List"}</button>)}
        <button type="button" aria-pressed={low} style={btn(low)} onClick={() => setLow((v) => !v)}>Card lower</button>
        <button type="button" style={{ ...btn(false), background: "#3d7bff", borderColor: "#3d7bff" }} disabled={!inputs || (busy != null && !busy.startsWith("failed"))} onClick={() => void render()}>{busy && !busy.startsWith("failed") ? `Rendering ${busy}` : "Render the file"}</button>
        {busy?.startsWith("failed") && <span role="alert" style={{ alignSelf: "center", color: "#ff7a7a", fontSize: 13 }}>{busy}</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 320px))", gap: 24 }}>
        <figure style={{ margin: 0 }}>
          <div style={{ borderRadius: 20, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" }}>
            {inputs && <Player component={ClipComposition} inputProps={previewProps({ ...inputs, finishOn: true, guide: false })} durationInFrames={frames} fps={OUTPUT.fps} compositionWidth={OUTPUT.width} compositionHeight={OUTPUT.height} style={{ width: "100%", aspectRatio: "9 / 16" }} controls loop acknowledgeRemotionLicense />}
          </div>
          <figcaption style={{ marginTop: 8, fontSize: 13, color: "rgba(244,245,247,0.62)" }}>Preview</figcaption>
        </figure>
        {out && (
          <figure style={{ margin: 0 }}>
            <video id="cutout-file" src={out.url} controls playsInline style={{ display: "block", width: "100%", aspectRatio: "9 / 16", borderRadius: 20, border: "1px solid rgba(255,255,255,0.1)", background: "#111318" }} />
            <figcaption style={{ marginTop: 8, fontSize: 13, color: "rgba(244,245,247,0.62)" }}>Rendered file, made in {(out.ms / 1000).toFixed(1)} s</figcaption>
          </figure>
        )}
      </div>
    </main>
  );
}
