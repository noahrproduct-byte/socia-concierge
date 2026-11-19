"use client";

// A check page for the animated graphics (components/studio/remotion/SceneLayer.tsx):
// each kind plays on a loop over a plain backdrop that stands in for the
// video, in the accent picked here. Development only.
import React, { useEffect, useState } from "react";
import { Player, Thumbnail } from "@remotion/player";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { SceneLayer, splitShare } from "./remotion/SceneLayer";
import { SPLIT_SKINS, SPLIT_SKIN_IDS, pictureWindow, skinOf, type SplitSkinId } from "@/lib/studioClips/splitSkins";
import { LogoCorner, LogoEnding } from "./remotion/ClipComposition";
import type { SceneSpan } from "@/lib/studioClips/scenes";
import { DEMO_EGYPT, DEMO_WAREHOUSE } from "@/lib/studioClips/sceneArtDemo";

const FPS = 30;
const SPANS: { name: string; what: string; span: SceneSpan; frames: number; stills: number[] }[] = [
  { name: "Figure", what: "When a number is said: \"we sell 200 burgers a day\".", frames: 96, stills: [15, 21, 60], span: { scene: { id: "g1", kind: "stat", key: "lab@0", dur: 2.6, text: "200", label: "burgers a day", icon: "food" }, from: 0, durationInFrames: 78, rows: [] } },
  { name: "Before and after", what: "When a change is said with its two numbers: \"from 65 seconds to 38\".", frames: 112, stills: [20, 34, 70], span: { scene: { id: "g4", kind: "change", key: "lab@0", dur: 3, text: "38", was: "65", label: "seconds", icon: "time" }, from: 0, durationInFrames: 92, rows: [] } },
  { name: "List", what: "When a list is counted out loud: \"first... second... third\".", frames: 170, stills: [16, 58, 110], span: { scene: { id: "g2", kind: "steps", key: "lab@0", dur: 5, text: "", items: [] }, from: 0, durationInFrames: 152, rows: [{ text: "we smash the beef", at: 0 }, { text: "we toast the buns", at: 36 }, { text: "we stack it high", at: 72 }] } },
  { name: "Picture", what: "When a thing or a place is said, or you ask for it: \"I bought a warehouse in Egypt\". SOCIA draws it.", frames: 120, stills: [16, 34, 80], span: { scene: { id: "g5", kind: "picture", key: "lab@0", dur: 3.4, text: "Warehouse in Egypt", label: "500 rugs", art: [DEMO_WAREHOUSE, DEMO_EGYPT] }, from: 0, durationInFrames: 102, rows: [] } },
  { name: "Logo of what is named", what: "When a company or product is named, its real mark is fetched: \"we moved everything into Notion\". (Here it is loaded straight from the web.)", frames: 110, stills: [20, 60], span: { scene: { id: "g6", kind: "picture", key: "lab@0", dur: 3, text: "Everything in Notion", art: [{ kind: "logo", name: "Notion", src: "https://www.google.com/s2/favicons?domain=notion.so&sz=256" }, DEMO_WAREHOUSE] }, from: 0, durationInFrames: 92, rows: [] } },
  { name: "Real web page", what: "When a site is named, its page is photographed and shown in a browser window. (Here it is loaded straight from the screenshot service.)", frames: 130, stills: [20, 90], span: { scene: { id: "g7", kind: "picture", key: "lab@0", dur: 3.6, text: "Notion's home page", art: [{ kind: "page", name: "notion.so", src: "https://api.microlink.io/?url=https%3A%2F%2Fwww.notion.so%2F&screenshot=true&meta=false&embed=screenshot.url&screenshot.type=jpeg&viewport.width=720&viewport.height=860&viewport.deviceScaleFactor=1" }] }, from: 0, durationInFrames: 110, rows: [] } },
  { name: "Key line", what: "When a short line carries the point: \"nobody else does it this way\".", frames: 108, stills: [16, 30, 70], span: { scene: { id: "g3", kind: "line", key: "lab@0", dur: 3, text: "Nobody else does it this way", icon: "star" }, from: 0, durationInFrames: 90, rows: [] } },
];
const ACCENTS = [["SOCIA blue", "#3d7bff"], ["Gold", "#e8b84a"], ["Yellow", "#ffd400"], ["Red", "#ff4d4d"], ["White", "#ffffff"]] as const;

// A stand-in mark for the logo demos: a plain disc with a letter, not any real brand.
const LOGO = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle cx="100" cy="100" r="92" fill="#fff"/><circle cx="100" cy="100" r="78" fill="none" stroke="#111" stroke-width="6"/><text x="100" y="128" text-anchor="middle" font-family="Arial, sans-serif" font-size="84" font-weight="700" fill="#111">B</text></svg>')}`;

function Backdrop({ span, split, skin }: { span: SceneSpan; split: boolean; skin: SplitSkinId }) {
  const f = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const share = split && f >= 9 && f < 9 + span.durationInFrames ? splitShare(f - 9, span.durationInFrames, fps) : 0;
  return (
    <AbsoluteFill style={{ backgroundColor: share ? skinOf(skin).bg : "#3b3f47" }}>
      <div style={{ position: "absolute", ...pictureWindow(skinOf(skin), share, width, height).box, overflow: "hidden", backgroundColor: "#3b3f47", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.35)", fontSize: 44, fontWeight: 600 }}>your video plays here</div>
    </AbsoluteFill>
  );
}

function Demo({ span, accent, split, skin }: { span: SceneSpan; accent: string; split: boolean; skin: SplitSkinId }) {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000", fontFamily: "Inter, system-ui, sans-serif" }}>
      <Backdrop span={span} split={split} skin={skin} />
      <Sequence from={9} durationInFrames={span.durationInFrames}>
        <SceneLayer span={span} fontFamily="Inter, system-ui, sans-serif" accent={accent} split={split} skin={skin} />
      </Sequence>
    </AbsoluteFill>
  );
}

function LogoDemo({ accent, card }: { accent: string; card: boolean }) {
  return (
    <AbsoluteFill style={{ backgroundColor: "#3b3f47", fontFamily: "Inter, system-ui, sans-serif" }}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.35)", fontSize: 44, fontWeight: 600 }}>your video plays here</AbsoluteFill>
      <Sequence from={0} durationInFrames={120}><LogoCorner src={LOGO} until={60} /></Sequence>
      <Sequence from={60}><LogoEnding src={LOGO} name="Your business" accent={accent} withCard={card} fontFamily="Inter, system-ui, sans-serif" /></Sequence>
    </AbsoluteFill>
  );
}

export default function SceneLab() {
  const [accent, setAccent] = useState<string>(ACCENTS[0][1]);
  const [split, setSplit] = useState(false);
  const [skin, setSkin] = useState<SplitSkinId>("socia");
  // The players draw in the browser only: nothing of them is rendered on the server, so there is nothing to mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <main style={{ minHeight: "100vh", background: "#08090c" }} />;
  return (
    <main style={{ minHeight: "100vh", padding: "32px 24px 48px", background: "#08090c", color: "#f4f5f7", fontFamily: "Inter, system-ui, sans-serif" }}>
      <h1 style={{ margin: 0, fontSize: 28, lineHeight: "34px" }}>Animated graphics</h1>
      <p style={{ margin: "8px 0 20px", maxWidth: 640, fontSize: 14, lineHeight: "20px", color: "rgba(244,245,247,0.62)" }}>The cards SOCIA can place over a video, with their icons, and the logo scene, each playing on a loop. The grey area stands in for your footage. The colour follows the look you pick; try a few here.</p>
      <div role="group" aria-label="Accent colour" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
        {ACCENTS.map(([name, hex]) => (
          <button key={hex} type="button" aria-pressed={accent === hex} onClick={() => setAccent(hex)} style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 36, padding: "0 12px", borderRadius: 10, border: `1px solid ${accent === hex ? "#f4f5f7" : "rgba(255,255,255,0.14)"}`, background: "#111318", color: "#f4f5f7", font: "inherit", fontSize: 13, cursor: "pointer" }}>
            <span aria-hidden style={{ width: 14, height: 14, borderRadius: 99, background: hex }} /> {name}
          </button>
        ))}
      </div>
      <div role="group" aria-label="Layout" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
        {([["Card over the picture", false], ["Split screen", true]] as const).map(([name, on]) => (
          <button key={name} type="button" aria-pressed={split === on} onClick={() => setSplit(on)} style={{ height: 36, padding: "0 12px", borderRadius: 10, border: `1px solid ${split === on ? "#f4f5f7" : "rgba(255,255,255,0.14)"}`, background: "#111318", color: "#f4f5f7", font: "inherit", fontSize: 13, cursor: "pointer" }}>{name}</button>
        ))}
      </div>
      {split && (
        <div role="group" aria-label="Split screen look" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
          {SPLIT_SKIN_IDS.map((id) => <button key={id} type="button" aria-pressed={skin === id} onClick={() => setSkin(id)} style={{ height: 36, padding: "0 12px", borderRadius: 10, border: `1px solid ${skin === id ? "#f4f5f7" : "rgba(255,255,255,0.14)"}`, background: "#111318", color: "#f4f5f7", font: "inherit", fontSize: 13, cursor: "pointer" }}>{SPLIT_SKINS[id].label}</button>)}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 300px))", gap: 24 }}>
        <figure style={{ margin: 0 }}>
          <div style={{ borderRadius: 20, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" }}>
            <Player component={LogoDemo} inputProps={{ accent, card: false }} durationInFrames={120} fps={FPS} compositionWidth={1080} compositionHeight={1920} style={{ width: "100%", aspectRatio: "9 / 16" }} autoPlay loop controls={false} acknowledgeRemotionLicense />
          </div>
          <figcaption style={{ marginTop: 10, fontSize: 13, lineHeight: "18px", color: "rgba(244,245,247,0.62)" }}><b style={{ display: "block", color: "#f4f5f7", fontSize: 15 }}>Logo</b>Your logo in the corner the whole way through, then landing on the ending. The mark here is a stand-in.</figcaption>
        </figure>
        {SPANS.map((x) => (
          <figure key={x.name} style={{ margin: 0 }}>
            <div style={{ borderRadius: 20, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" }}>
              <Player component={Demo} inputProps={{ span: x.span, accent, split, skin }} durationInFrames={x.frames} fps={FPS} compositionWidth={1080} compositionHeight={1920} style={{ width: "100%", aspectRatio: "9 / 16" }} autoPlay loop controls={false} acknowledgeRemotionLicense />
            </div>
            <figcaption style={{ marginTop: 10, fontSize: 13, lineHeight: "18px", color: "rgba(244,245,247,0.62)" }}><b style={{ display: "block", color: "#f4f5f7", fontSize: 15 }}>{x.name}</b>{x.what}</figcaption>
          </figure>
        ))}
      </div>
      <h2 style={{ margin: "40px 0 6px", fontSize: 20, lineHeight: "28px" }}>Each one, step by step</h2>
      <p style={{ margin: "0 0 16px", maxWidth: 640, fontSize: 14, lineHeight: "20px", color: "rgba(244,245,247,0.62)" }}>Three moments of each card: as it comes on, part way through, and as it holds.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 112px))", gap: 10 }}>
        {SPANS.flatMap((x) => x.stills.map((frame) => (
          <figure key={`${x.name}-${frame}`} style={{ margin: 0 }}>
            <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" }}>
              <Thumbnail component={Demo} inputProps={{ span: x.span, accent, split, skin }} frameToDisplay={frame} durationInFrames={x.frames} fps={FPS} compositionWidth={1080} compositionHeight={1920} style={{ width: "100%", aspectRatio: "9 / 16" }} />
            </div>
            <figcaption style={{ marginTop: 6, fontSize: 12, lineHeight: "16px", color: "rgba(244,245,247,0.62)" }}>{x.name}</figcaption>
          </figure>
        )))}
      </div>
    </main>
  );
}
