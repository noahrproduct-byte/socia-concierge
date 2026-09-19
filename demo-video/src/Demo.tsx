import React from "react";
import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { camPath, camTransform, EASE, type Cam } from "./camera";
import { frameSrc, marker, CLIPS, SRC_H, SRC_W, type ClipName } from "./footage";
import { AUDIO_SRC, BRAND, FPS, MS_PER_FRAME, T } from "./timeline";
import mark from "./brand/socia-mark.png";

export type Layout = "vertical" | "wide";

/* ---------------- layout ---------------- */

type LayoutSpec = {
  kind: Layout;
  win: { x: number; y: number; w: number; h: number };
  base: { w: number; h: number }; // source region that fills the window at zoom 1
  callout: { x: number; y: number; size: number };
  header: { x: number; y: number } | null;
};

const LAYOUTS: Record<Layout, LayoutSpec> = {
  // callouts live OUTSIDE the footage window in both layouts, so they can never sit on UI numbers
  // vertical crops to a ~1040px-wide column of the desktop UI so text stays legible on a phone
  vertical: { kind: "vertical", win: { x: 40, y: 500, w: 1000, h: 1040 }, base: { w: 1180, h: 1080 }, callout: { x: 40, y: 400, size: 24 }, header: { x: 40, y: 120 } },
  wide: { kind: "wide", win: { x: 160, y: 60, w: 1600, h: 900 }, base: { w: 1920, h: 1080 }, callout: { x: 160, y: 992, size: 20 }, header: null },
};

const SWEEPS = [T.s2, T.s3, T.s4, T.s4b, T.s5, T.s6, T.end];

/* ---------------- primitives ---------------- */

const Frame: React.FC<{ spec: LayoutSpec; scale?: number; chrome?: string; children: React.ReactNode }> = ({ spec, scale = 1, chrome, children }) => {
  const { win } = spec;
  const bar = chrome ? 44 : 0;
  return (
    <div
      style={{
        position: "absolute",
        left: win.x,
        top: win.y,
        width: win.w,
        height: win.h,
        transform: `scale(${scale})`,
        transformOrigin: "50% 50%",
        borderRadius: 20,
        overflow: "hidden",
        background: BRAND.bg,
        border: "1px solid rgba(123,108,246,0.38)",
        boxShadow: "0 40px 90px -30px rgba(123,108,246,0.45), 0 0 0 1px rgba(255,255,255,0.03) inset",
      }}
    >
      {chrome && (
        <div style={{ height: bar, display: "flex", alignItems: "center", gap: 8, padding: "0 16px", background: "#0F182D", borderBottom: "1px solid rgba(255,255,255,0.06)", fontFamily: BRAND.font }}>
          {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
            <span key={c} style={{ width: 11, height: 11, borderRadius: 6, background: c, opacity: 0.9 }} />
          ))}
          <div style={{ marginLeft: 12, flex: 1, maxWidth: 560, height: 26, borderRadius: 13, background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", padding: "0 14px", color: BRAND.muted, fontSize: 13, letterSpacing: 0.2 }}>
            <span style={{ width: 9, height: 9, borderRadius: 5, border: "1.5px solid rgba(243,244,250,0.5)", marginRight: 8 }} />
            {chrome}
          </div>
        </div>
      )}
      <div style={{ position: "absolute", left: 0, top: bar, right: 0, bottom: 0, overflow: "hidden" }}>{children}</div>
    </div>
  );
};

const Footage: React.FC<{ spec: LayoutSpec; clip: ClipName; ms: number; cam: Cam }> = ({ spec, clip, ms, cam }) => (
  <div style={{ position: "absolute", left: 0, top: 0, width: SRC_W, height: SRC_H, transform: camTransform(cam, spec.win, spec.base), transformOrigin: "0 0", willChange: "transform" }}>
    <Img src={frameSrc(clip, ms)} style={{ width: SRC_W, height: SRC_H, display: "block" }} />
  </div>
);

const Callout: React.FC<{ spec: LayoutSpec; text: string; from?: number }> = ({ spec, text, from = 10 }) => {
  const f = useCurrentFrame() - from;
  const enter = 9; // 150ms
  const o = interpolate(f, [0, enter], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const y = interpolate(f, [0, enter], [14, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  return (
    <div
      style={{
        position: "absolute",
        left: spec.callout.x,
        top: spec.callout.y,
        display: "flex",
        alignItems: "center",
        gap: 14,
        opacity: o,
        transform: `translateY(${y}px)`,
        fontFamily: BRAND.font,
        fontSize: spec.callout.size,
        fontWeight: 600,
        letterSpacing: "0.24em",
        textTransform: "uppercase",
        color: BRAND.text,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 10, height: 10, borderRadius: 5, background: BRAND.violet, boxShadow: `0 0 18px ${BRAND.violet}` }} />
      {text}
    </div>
  );
};

/** Thin violet scan line sweeping across the canvas, centred on a cut. */
const Sweep: React.FC<{ at: number }> = ({ at }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const half = 9; // 300ms total
  if (frame < at - half || frame > at + half) return null;
  const x = interpolate(frame, [at - half, at + half], [-60, width + 60], { easing: EASE });
  const glow = interpolate(Math.abs(frame - at), [0, half], [1, 0.35]);
  return (
    <div style={{ position: "absolute", left: x, top: 0, width: 3, height, background: BRAND.violet, opacity: glow, boxShadow: `0 0 28px 6px rgba(123,108,246,0.65)` }}>
      <div style={{ position: "absolute", right: 3, top: 0, width: 120, height, background: "linear-gradient(90deg, rgba(123,108,246,0) 0%, rgba(123,108,246,0.16) 100%)" }} />
    </div>
  );
};

const Header: React.FC<{ spec: LayoutSpec }> = ({ spec }) => {
  if (!spec.header) return null;
  return (
    <div style={{ position: "absolute", left: spec.header.x, top: spec.header.y, display: "flex", alignItems: "center", gap: 14, fontFamily: BRAND.font }}>
      <Img src={mark} style={{ width: 44, height: 44, borderRadius: 11 }} />
      <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: "0.02em", color: BRAND.text }}>SOCIA</span>
      <span style={{ marginLeft: 10, fontSize: 14, letterSpacing: "0.26em", color: BRAND.muted, textTransform: "uppercase" }}>Product demo</span>
    </div>
  );
};

/* ---------------- scenes ---------------- */

/** Pick a camera per layout: the vertical crop shows a ~1040px column, so its centres differ. */
const pick = (spec: LayoutSpec, wide: Cam, vertical: Cam): Cam => (spec.kind === "vertical" ? vertical : wide);

const Scene1: React.FC<{ spec: LayoutSpec }> = ({ spec }) => {
  const f = useCurrentFrame();
  const ms = 1300 + f * MS_PER_FRAME; // start mid-animation, counters already rolling
  const cam = pick(spec, { zoom: 1, cx: 960, cy: 500 }, { zoom: 1, cx: 800, cy: 500 });
  return (
    <>
      <Frame spec={spec}>
        <Footage spec={spec} clip="competitors-load" ms={ms} cam={cam} />
      </Frame>
      <Callout spec={spec} text="An AI just scanned your market" />
    </>
  );
};

const Scene2: React.FC<{ spec: LayoutSpec }> = ({ spec }) => {
  const f = useCurrentFrame();
  const split = 180;
  const clickScroll = marker("competitors-click", "scroll");
  const rate = 1.5;
  const snapAt = split + Math.round(clickScroll / rate / MS_PER_FRAME) + 20;
  const cam = camPath(f, [
    [0, pick(spec, { zoom: 1, cx: 960, cy: 500 }, { zoom: 1, cx: 800, cy: 500 })],
    [split - 40, pick(spec, { zoom: 1.12, cx: 960, cy: 330 }, { zoom: 1.12, cx: 780, cy: 330 })], // push-in on the intelligence strip
    [split, pick(spec, { zoom: 1, cx: 960, cy: 540 }, { zoom: 1, cx: 800, cy: 540 })],
    [snapAt, pick(spec, { zoom: 1, cx: 960, cy: 540 }, { zoom: 1, cx: 800, cy: 540 })],
    [snapAt + 12, pick(spec, { zoom: 1.15, cx: 960, cy: 330 }, { zoom: 1.1, cx: 760, cy: 330 })], // snap-pan onto the gap bars after the page scrolls
  ]);
  const body =
    f < split ? (
      <Footage spec={spec} clip="competitors-load" ms={1300 + (T.s2 + f) * MS_PER_FRAME} cam={cam} />
    ) : (
      <Footage spec={spec} clip="competitors-click" ms={(f - split) * MS_PER_FRAME * rate} cam={cam} />
    );
  return (
    <>
      <Frame spec={spec}>{body}</Frame>
      <Callout spec={spec} text="Who's winning — and why" />
    </>
  );
};

const Scene3: React.FC<{ spec: LayoutSpec }> = ({ spec }) => {
  const f = useCurrentFrame();
  const scoreAt = marker("scorer", "score-visible");
  const fixAt = marker("scorer", "fix-click");
  const rampFrames = 150; // 2.5s of ramped upload → extraction → analysis
  const rampTo = scoreAt - 500;
  const ms = f < rampFrames ? 400 + (rampTo - 400) * Math.pow(f / rampFrames, 1.5) : rampTo + (f - rampFrames) * MS_PER_FRAME;
  const fixFrame = rampFrames + Math.round((fixAt - rampTo) / MS_PER_FRAME);
  const cam = camPath(f, [
    [0, pick(spec, { zoom: 1, cx: 960, cy: 540 }, { zoom: 1, cx: 700, cy: 540 })],
    [rampFrames, pick(spec, { zoom: 1, cx: 960, cy: 540 }, { zoom: 1, cx: 700, cy: 540 })],
    [rampFrames + 40, pick(spec, { zoom: 1.15, cx: 1230, cy: 440 }, { zoom: 1, cx: 1230, cy: 440 })], // the score ring drawing in
    [fixFrame, pick(spec, { zoom: 1.15, cx: 1230, cy: 440 }, { zoom: 1, cx: 1230, cy: 440 })],
    [fixFrame + 26, pick(spec, { zoom: 1.22, cx: 880, cy: 820 }, { zoom: 1.05, cx: 900, cy: 800 })], // the fix click + the player seeking to its marker
  ]);
  return (
    <>
      <Frame spec={spec}>
        <Footage spec={spec} clip="scorer" ms={ms} cam={cam} />
      </Frame>
      <Callout spec={spec} text="Scored before you post" />
    </>
  );
};

const Scene4: React.FC<{ spec: LayoutSpec }> = ({ spec }) => {
  const f = useCurrentFrame();
  const dash = T.s4b - T.s4; // 120 frames of dashboard
  if (f < dash) {
    const cam = camPath(f, [
      [0, { zoom: 1, cx: 960, cy: 520 }],
      [dash, { zoom: 1.06, cx: 960, cy: 500 }],
    ]);
    return (
      <Frame spec={spec}>
        <Footage spec={spec} clip="dashboard" ms={2500 + f * MS_PER_FRAME} cam={cam} />
      </Frame>
    );
  }
  const g = f - dash;
  const typingAt = marker("chat", "typing");
  const sendAt = marker("chat", "send");
  const doneAt = marker("chat", "answer-done");
  const typeFrames = Math.round((sendAt - typingAt) / 3 / MS_PER_FRAME); // typing at 3×
  const ms = g < typeFrames ? typingAt + g * MS_PER_FRAME * 3 : doneAt - 1000 + (g - typeFrames) * MS_PER_FRAME; // answer at 1×
  const cam = camPath(g, [
    [0, pick(spec, { zoom: 1.25, cx: 1500, cy: 700 }, { zoom: 1, cx: 1660, cy: 540 })],
    [typeFrames, pick(spec, { zoom: 1.25, cx: 1500, cy: 700 }, { zoom: 1, cx: 1660, cy: 540 })],
    [typeFrames + 24, pick(spec, { zoom: 1.2, cx: 1500, cy: 420 }, { zoom: 1, cx: 1660, cy: 540 })],
  ]);
  return (
    <>
      <Frame spec={spec}>
        <Footage spec={spec} clip="chat" ms={ms} cam={cam} />
      </Frame>
      <Callout spec={spec} text="Ask anything · your data" />
    </>
  );
};

const Scene5: React.FC<{ spec: LayoutSpec }> = ({ spec }) => {
  const f = useCurrentFrame();
  const ms = CLIPS.scorer.durationMs; // hold the final state: the app's suggested next move
  const cam = camPath(f, [
    [0, pick(spec, { zoom: 1.08, cx: 1230, cy: 860 }, { zoom: 1, cx: 1231, cy: 840 })],
    [T.s6 - T.s5, pick(spec, { zoom: 1.3, cx: 1230, cy: 880 }, { zoom: 1.06, cx: 1231, cy: 900 })],
  ]);
  return (
    <Frame spec={spec}>
      <Footage spec={spec} clip="scorer" ms={ms} cam={cam} />
    </Frame>
  );
};

const Scene6: React.FC<{ spec: LayoutSpec }> = ({ spec }) => {
  const f = useCurrentFrame();
  const scale = interpolate(f, [0, T.end - T.s6], [1.12, 1], { extrapolateRight: "clamp", easing: EASE });
  return (
    <Frame spec={spec} scale={scale} chrome="socia-concierge.vercel.app/competitors">
      <Img src={staticFile("url-bar.png")} style={{ width: "100%", display: "block" }} />
    </Frame>
  );
};

const EndCard: React.FC = () => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const vertical = height > width;
  const pop = spring({ frame: f, fps: FPS, config: { damping: 16, stiffness: 120 } });
  const tagline = interpolate(f, [10, 24], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const taglineY = interpolate(f, [10, 24], [18, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const url = interpolate(f, [70, 84], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const bars = [0, 1, 2].map((i) => 26 + 30 * (0.5 + 0.5 * Math.sin(f / 5.5 + i * 1.15)));
  return (
    <AbsoluteFill style={{ background: BRAND.bg, alignItems: "center", justifyContent: "center", fontFamily: BRAND.font }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(60% 45% at 50% 42%, rgba(123,108,246,0.18) 0%, rgba(11,18,32,0) 100%)" }} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: vertical ? 36 : 28, transform: `scale(${0.92 + 0.08 * pop})`, opacity: pop }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <Img src={mark} style={{ width: vertical ? 96 : 84, height: vertical ? 96 : 84, borderRadius: 24 }} />
          <span style={{ fontSize: vertical ? 96 : 84, fontWeight: 800, letterSpacing: "0.01em", color: BRAND.text }}>SOCIA</span>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginLeft: 10, height: 64 }}>
            {bars.map((h, i) => (
              <span key={i} style={{ width: 12, height: h, borderRadius: 6, background: BRAND.violet, boxShadow: `0 0 16px rgba(123,108,246,0.6)` }} />
            ))}
          </div>
        </div>
        <div style={{ fontSize: vertical ? 74 : 62, fontWeight: 600, color: BRAND.text, opacity: tagline, transform: `translateY(${taglineY}px)`, letterSpacing: "-0.01em" }}>Stop guessing.</div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, opacity: url, marginTop: 6 }}>
          <span style={{ fontSize: vertical ? 34 : 30, color: BRAND.muted, letterSpacing: "0.02em" }}>socia-concierge.vercel.app</span>
          <span style={{ fontSize: vertical ? 15 : 13, letterSpacing: "0.3em", textTransform: "uppercase", color: BRAND.violet, border: "1px solid rgba(123,108,246,0.6)", borderRadius: 999, padding: "8px 16px 7px 19px" }}>Early access</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ---------------- master ---------------- */

export const Demo: React.FC<{ layout: Layout }> = ({ layout }) => {
  const spec = LAYOUTS[layout];
  return (
    <AbsoluteFill style={{ background: BRAND.bg }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(70% 50% at 50% 30%, rgba(123,108,246,0.12) 0%, rgba(11,18,32,0) 100%)" }} />
      <Sequence from={T.s1} durationInFrames={T.s2 - T.s1} name="1 · competitors load"><Scene1 spec={spec} /></Sequence>
      <Sequence from={T.s2} durationInFrames={T.s3 - T.s2} name="2 · push-in + re-derive"><Scene2 spec={spec} /></Sequence>
      <Sequence from={T.s3} durationInFrames={T.s4 - T.s3} name="3 · scorer"><Scene3 spec={spec} /></Sequence>
      <Sequence from={T.s4} durationInFrames={T.s5 - T.s4} name="4 · dashboard + ask"><Scene4 spec={spec} /></Sequence>
      <Sequence from={T.s5} durationInFrames={T.s6 - T.s5} name="5 · next move"><Scene5 spec={spec} /></Sequence>
      <Sequence from={T.s6} durationInFrames={T.end - T.s6} name="6 · url zoom-out"><Scene6 spec={spec} /></Sequence>
      <Sequence from={T.end} name="end card"><EndCard /></Sequence>
      <Sequence from={0} durationInFrames={T.end} name="header"><Header spec={spec} /></Sequence>
      {SWEEPS.map((at) => <Sweep key={at} at={at} />)}
      {/* audio slot — set AUDIO_SRC in timeline.ts */}
      {AUDIO_SRC && <Sequence from={0} name="audio"><Audio src={staticFile(AUDIO_SRC)} /></Sequence>}
    </AbsoluteFill>
  );
};
