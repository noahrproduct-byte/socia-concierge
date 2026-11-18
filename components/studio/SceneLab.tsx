"use client";

// A check page for the animated graphics (components/studio/remotion/SceneLayer.tsx):
// each kind plays on a loop over a plain backdrop that stands in for the
// video, in the accent picked here. Development only.
import React, { useEffect, useState } from "react";
import { Player, Thumbnail } from "@remotion/player";
import { AbsoluteFill, Sequence } from "remotion";
import { SceneLayer } from "./remotion/SceneLayer";
import type { SceneSpan } from "@/lib/studioClips/scenes";

const FPS = 30;
const SPANS: { name: string; what: string; span: SceneSpan; frames: number; stills: number[] }[] = [
  { name: "Figure", what: "When a number is said: \"we sell 200 burgers a day\".", frames: 96, stills: [15, 21, 60], span: { scene: { id: "g1", kind: "stat", key: "lab@0", dur: 2.6, text: "200", label: "burgers a day" }, from: 0, durationInFrames: 78, rows: [] } },
  { name: "List", what: "When a list is counted out loud: \"first... second... third\".", frames: 170, stills: [16, 58, 110], span: { scene: { id: "g2", kind: "steps", key: "lab@0", dur: 5, text: "", items: [] }, from: 0, durationInFrames: 152, rows: [{ text: "we smash the beef", at: 0 }, { text: "we toast the buns", at: 36 }, { text: "we stack it high", at: 72 }] } },
  { name: "Key line", what: "When a short line carries the point: \"nobody else does it this way\".", frames: 108, stills: [16, 30, 70], span: { scene: { id: "g3", kind: "line", key: "lab@0", dur: 3, text: "Nobody else does it this way" }, from: 0, durationInFrames: 90, rows: [] } },
];
const ACCENTS = [["SOCIA blue", "#3d7bff"], ["Gold", "#e8b84a"], ["Yellow", "#ffd400"], ["Red", "#ff4d4d"], ["White", "#ffffff"]] as const;

function Demo({ span, accent }: { span: SceneSpan; accent: string }) {
  return (
    <AbsoluteFill style={{ backgroundColor: "#3b3f47", fontFamily: "Inter, system-ui, sans-serif" }}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.35)", fontSize: 44, fontWeight: 600 }}>your video plays here</AbsoluteFill>
      <Sequence from={9} durationInFrames={span.durationInFrames}>
        <SceneLayer span={span} fontFamily="Inter, system-ui, sans-serif" accent={accent} />
      </Sequence>
    </AbsoluteFill>
  );
}

export default function SceneLab() {
  const [accent, setAccent] = useState<string>(ACCENTS[0][1]);
  // The players draw in the browser only: nothing of them is rendered on the server, so there is nothing to mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <main style={{ minHeight: "100vh", background: "#08090c" }} />;
  return (
    <main style={{ minHeight: "100vh", padding: "32px 24px 48px", background: "#08090c", color: "#f4f5f7", fontFamily: "Inter, system-ui, sans-serif" }}>
      <h1 style={{ margin: 0, fontSize: 28, lineHeight: "34px" }}>Animated graphics</h1>
      <p style={{ margin: "8px 0 20px", maxWidth: 640, fontSize: 14, lineHeight: "20px", color: "rgba(244,245,247,0.62)" }}>The three cards SOCIA can place over a video, each playing on a loop. The grey area stands in for your footage. The colour follows the look you pick; try a few here.</p>
      <div role="group" aria-label="Accent colour" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
        {ACCENTS.map(([name, hex]) => (
          <button key={hex} type="button" aria-pressed={accent === hex} onClick={() => setAccent(hex)} style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 36, padding: "0 12px", borderRadius: 10, border: `1px solid ${accent === hex ? "#f4f5f7" : "rgba(255,255,255,0.14)"}`, background: "#111318", color: "#f4f5f7", font: "inherit", fontSize: 13, cursor: "pointer" }}>
            <span aria-hidden style={{ width: 14, height: 14, borderRadius: 99, background: hex }} /> {name}
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 300px))", gap: 24 }}>
        {SPANS.map((x) => (
          <figure key={x.name} style={{ margin: 0 }}>
            <div style={{ borderRadius: 20, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" }}>
              <Player component={Demo} inputProps={{ span: x.span, accent }} durationInFrames={x.frames} fps={FPS} compositionWidth={1080} compositionHeight={1920} style={{ width: "100%", aspectRatio: "9 / 16" }} autoPlay loop controls={false} acknowledgeRemotionLicense />
            </div>
            <figcaption style={{ marginTop: 10, fontSize: 13, lineHeight: "18px", color: "rgba(244,245,247,0.62)" }}><b style={{ display: "block", color: "#f4f5f7", fontSize: 15 }}>{x.name}</b>{x.what}</figcaption>
          </figure>
        ))}
      </div>
      <h2 style={{ margin: "40px 0 6px", fontSize: 20, lineHeight: "28px" }}>Each one, step by step</h2>
      <p style={{ margin: "0 0 16px", maxWidth: 640, fontSize: 14, lineHeight: "20px", color: "rgba(244,245,247,0.62)" }}>Three moments of each card: as it comes on, part way through, and as it holds.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(9, minmax(0, 150px))", gap: 10 }}>
        {SPANS.flatMap((x) => x.stills.map((frame) => (
          <figure key={`${x.name}-${frame}`} style={{ margin: 0 }}>
            <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" }}>
              <Thumbnail component={Demo} inputProps={{ span: x.span, accent }} frameToDisplay={frame} durationInFrames={x.frames} fps={FPS} compositionWidth={1080} compositionHeight={1920} style={{ width: "100%", aspectRatio: "9 / 16" }} />
            </div>
            <figcaption style={{ marginTop: 6, fontSize: 12, lineHeight: "16px", color: "rgba(244,245,247,0.62)" }}>{x.name}</figcaption>
          </figure>
        )))}
      </div>
    </main>
  );
}
