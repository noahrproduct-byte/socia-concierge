// The demo that plays ON the laptop screen. Mirrors the reference's rhythm:
// kinetic title cards alternating every ~2s with cropped, tilted UI cards
// floating on a violet gradient, a cursor hand clicking the real controls,
// ending on a tagline card. All UI is cropped from the live captures.

import React from "react";
import { AbsoluteFill, Easing, Img, Sequence, interpolate, spring, useCurrentFrame } from "remotion";
import { CLIPS, frameSrc, marker, SRC_H, SRC_W, type ClipName } from "../footage";
import { BRAND, FPS, MS_PER_FRAME } from "../timeline";
import mark from "../brand/socia-mark.png";

export const SCREEN_FRAMES = 45 * FPS; // 2700 — matches the reference's length
const EASE = Easing.bezier(0.22, 0.9, 0.3, 1);
const FONT = "-apple-system, 'SF Pro Display', 'SF Pro Text', Inter, 'Helvetica Neue', Arial, sans-serif";

type Size = { w: number; h: number };

/* ---------------- background ---------------- */

export const Bg: React.FC<{ size: Size; hot?: number }> = ({ size, hot = 0.9 }) => {
  const f = useCurrentFrame();
  const rot = f * 0.05;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 90% at 50% 110%, #8A7BFF 0%, #5546D6 35%, #262566 70%, #131A3A 100%)` }}>
      <Img
        src={mark}
        style={{
          position: "absolute",
          width: size.w * 0.95,
          height: size.w * 0.95,
          left: size.w * 0.5 - size.w * 0.475,
          top: size.h * 0.5 - size.w * 0.475 + size.h * 0.05,
          opacity: 0.7 * hot,
          filter: "blur(70px) saturate(1.3)",
          transform: `rotate(${rot}deg) scale(1.15)`,
        }}
      />
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(70% 60% at 50% 45%, rgba(123,108,246,0.28) 0%, rgba(11,18,32,0) 100%)" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(11,18,32,0.55) 0%, rgba(11,18,32,0) 40%, rgba(11,18,32,0) 70%, rgba(11,18,32,0.35) 100%)" }} />
    </AbsoluteFill>
  );
};

/* ---------------- typography ---------------- */

type Seg = { t: string; i?: boolean; a?: boolean };

export const Title: React.FC<{ size: Size; lines: Seg[][]; x?: number; y?: number; align?: "left" | "center"; scale?: number; from?: number }> = ({ size, lines, x, y, align = "center", scale = 1, from = 0 }) => {
  const f = useCurrentFrame() - from;
  const fs = Math.round(size.h * 0.085 * scale);
  let wi = 0;
  return (
    <div style={{ position: "absolute", left: x ?? 0, top: y ?? size.h * 0.5 - (fs * 1.15 * lines.length) / 2, width: x != null ? undefined : size.w, textAlign: align, fontFamily: FONT, color: BRAND.text, fontSize: fs, lineHeight: 1.12, fontWeight: 800, letterSpacing: "-0.02em" }}>
      {lines.map((line, li) => (
        <div key={li} style={{ whiteSpace: "nowrap" }}>
          {line.map((s, si) => {
            const words = s.t.split(" ");
            return words.map((w, k) => {
              const idx = wi++;
              const p = spring({ frame: f - idx * 3, fps: FPS, config: { damping: 18, stiffness: 160 } });
              const o = interpolate(f - idx * 3, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
              return (
                <span key={`${si}-${k}`} style={{ display: "inline-block", opacity: o, transform: `translateY(${(1 - p) * 26}px)`, fontStyle: s.i ? "italic" : "normal", fontWeight: s.i ? 600 : 800, color: s.a ? "#B9B0FF" : BRAND.text, marginRight: k < words.length - 1 || si < line.length - 1 ? "0.26em" : 0 }}>
                  {w}
                </span>
              );
            });
          })}
        </div>
      ))}
    </div>
  );
};

/* ---------------- floating UI card ---------------- */

type Crop = { x: number; y: number; w: number; h: number };

const UICard: React.FC<{
  clip: ClipName;
  ms: number;
  crop: Crop;
  scale: number;
  x: number;
  y: number;
  tilt?: { rx: number; ry: number; rz?: number };
  from?: number;
  children?: React.ReactNode;
  glow?: boolean;
}> = ({ clip, ms, crop, scale, x, y, tilt = { rx: 4, ry: -8, rz: 0 }, from = 0, children, glow = true }) => {
  const f = useCurrentFrame() - from;
  const p = spring({ frame: f, fps: FPS, config: { damping: 16, stiffness: 110 } });
  const o = interpolate(f, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const w = crop.w * scale;
  const h = crop.h * scale;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h, perspective: 1800, opacity: o }}>
      <div
        style={{
          width: w,
          height: h,
          borderRadius: 18 * Math.max(1, scale * 0.9),
          overflow: "hidden",
          background: "#0F1630",
          border: "1px solid rgba(255,255,255,0.22)",
          boxShadow: glow ? "0 50px 120px -30px rgba(0,0,0,0.75), 0 0 0 1px rgba(123,108,246,0.25), 0 30px 80px -40px rgba(123,108,246,0.6)" : "0 40px 100px -30px rgba(0,0,0,0.7)",
          transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) rotateZ(${tilt.rz ?? 0}deg) translateY(${(1 - p) * 60}px) scale(${0.94 + 0.06 * p})`,
          transformOrigin: "50% 60%",
        }}
      >
        <div style={{ position: "absolute", left: -crop.x * scale, top: -crop.y * scale, width: SRC_W * scale, height: SRC_H * scale }}>
          <Img src={frameSrc(clip, ms)} style={{ width: SRC_W * scale, height: SRC_H * scale, display: "block", filter: "brightness(1.18) contrast(1.06)" }} />
        </div>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 40%)" }} />
        {children}
      </div>
    </div>
  );
};

/* ---------------- cursor ---------------- */

type CursorKey = { f: number; x: number; y: number; click?: boolean };

const Cursor: React.FC<{ keys: CursorKey[]; size?: number }> = ({ keys, size = 54 }) => {
  const f = useCurrentFrame();
  let x = keys[0].x;
  let y = keys[0].y;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    if (f >= a.f && f <= b.f) {
      const t = interpolate(f, [a.f, b.f], [0, 1], { easing: EASE });
      x = a.x + (b.x - a.x) * t;
      y = a.y + (b.y - a.y) * t;
      break;
    }
    if (f > b.f) {
      x = b.x;
      y = b.y;
    }
  }
  const click = keys.find((k) => k.click && f >= k.f && f < k.f + 14);
  const press = click ? interpolate(f - click.f, [0, 5, 14], [1, 0.82, 1], { extrapolateRight: "clamp" }) : 1;
  const ripple = click ? interpolate(f - click.f, [0, 14], [0, 1]) : 0;
  const o = interpolate(f, [keys[0].f, keys[0].f + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: x, top: y, opacity: o, transform: `translate(-30%, -12%) scale(${press})`, transformOrigin: "30% 12%", filter: "drop-shadow(0 8px 14px rgba(0,0,0,0.55))" }}>
      {click && <div style={{ position: "absolute", left: -12 + 30 * 0.3 * size / 54, top: -12, width: 40 + ripple * 60, height: 40 + ripple * 60, marginLeft: -(ripple * 30), marginTop: -(ripple * 30), borderRadius: 999, border: "3px solid rgba(255,255,255,0.9)", opacity: 1 - ripple }} />}
      <svg width={size} height={size * 1.25} viewBox="0 0 24 30">
        <path d="M7 2.5c-1.1 0-2 .9-2 2v11.2l-1.6-1.9c-.8-.9-2.2-1-3.1-.2-.8.7-.9 1.9-.3 2.8l4.6 6.9c1 1.5 2.7 2.4 4.5 2.4h4.7c2.8 0 5-2.2 5-5v-6.2c0-1.1-.9-2-2-2-.4 0-.7.1-1 .3-.2-1-1.1-1.8-2.1-1.8-.5 0-.9.2-1.3.4-.3-.9-1.1-1.5-2.1-1.5-.4 0-.8.1-1.1.3V4.5c0-1.1-.9-2-2-2z" fill="#fff" stroke="#111" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

/* ---------------- brand bits ---------------- */

export const Lockup: React.FC<{ size: number; from?: number }> = ({ size, from = 0 }) => {
  const f = useCurrentFrame() - from;
  const p = spring({ frame: f, fps: FPS, config: { damping: 14, stiffness: 120 } });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.22, opacity: p, transform: `scale(${0.9 + 0.1 * p})`, fontFamily: FONT }}>
      <Img src={mark} style={{ width: size, height: size, borderRadius: size * 0.24, boxShadow: "0 20px 60px -10px rgba(123,108,246,0.7)" }} />
      <span style={{ fontSize: size * 0.92, fontWeight: 800, letterSpacing: "0.01em", color: BRAND.text }}>SOCIA</span>
    </div>
  );
};

const Pill: React.FC<{ text: string; from?: number; style?: React.CSSProperties }> = ({ text, from = 0, style }) => {
  const f = useCurrentFrame() - from;
  const p = spring({ frame: f, fps: FPS, config: { damping: 16, stiffness: 140 } });
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "12px 22px", borderRadius: 999, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)", color: BRAND.text, fontFamily: FONT, fontSize: 28, fontWeight: 600, opacity: p, transform: `translateY(${(1 - p) * 20}px)`, backdropFilter: "blur(10px)", ...style }}>
      <span style={{ color: "#B9B0FF" }}>✓</span>
      {text}
    </div>
  );
};

/* ---------------- scenes ---------------- */

const S = (sec: number) => Math.round(sec * FPS);

const IntroLogo: React.FC<{ size: Size }> = ({ size }) => {
  const f = useCurrentFrame();
  const p = spring({ frame: f, fps: FPS, config: { damping: 12, stiffness: 90 } });
  const grow = interpolate(f, [S(1.2), S(2)], [1, 9], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) });
  const fade = interpolate(f, [S(1.4), S(2)], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const m = size.h * 0.26;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <Img src={mark} style={{ width: m, height: m, borderRadius: m * 0.24, opacity: p * fade, transform: `scale(${(0.6 + 0.4 * p) * grow})`, filter: `blur(${(grow - 1) * 3}px)`, boxShadow: "0 40px 120px -20px rgba(123,108,246,0.9)" }} />
    </AbsoluteFill>
  );
};

const Hero: React.FC<{ size: Size }> = ({ size }) => {
  const s = size.w / 1920;
  const scoreAt = marker("scorer", "score-visible") + 2500;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <Lockup size={size.h * 0.13} />
      </AbsoluteFill>
      <UICard clip="scorer" ms={scoreAt} crop={{ x: 708, y: 245, w: 560, h: 200 }} scale={1.05 * s} x={size.w * 0.06} y={size.h * 0.12} tilt={{ rx: 6, ry: 12, rz: -3 }} from={4} />
      <UICard clip="competitors-load" ms={6500} crop={{ x: 495, y: 315, w: 200, h: 122 }} scale={1.5 * s} x={size.w * 0.7} y={size.h * 0.16} tilt={{ rx: 6, ry: -14, rz: 3 }} from={10} />
      <UICard clip="chat" ms={CLIPS.chat.durationMs - 200} crop={{ x: 1450, y: 785, w: 440, h: 80 }} scale={1.25 * s} x={size.w * 0.52} y={size.h * 0.72} tilt={{ rx: -4, ry: -10, rz: 2 }} from={16} />
      <UICard clip="dashboard" ms={3000} crop={{ x: 759, y: 400, w: 490, h: 190 }} scale={0.9 * s} x={size.w * 0.08} y={size.h * 0.66} tilt={{ rx: -5, ry: 12, rz: -2 }} from={22} />
    </AbsoluteFill>
  );
};

const CompetitorsScene: React.FC<{ size: Size }> = ({ size }) => {
  const f = useCurrentFrame();
  const s = size.w / 1920;
  const clickAt = marker("competitors-click", "chip-click");
  const ms = Math.min(clickAt - 400 + f * MS_PER_FRAME, marker("competitors-click", "scroll") - 100);
  const crop = { x: 288, y: 540, w: 780, h: 210 };
  const sc = 2.0 * s;
  const cx = size.w * 0.5 - (crop.w * sc) / 2;
  const cy = size.h * 0.56 - (crop.h * sc) / 2;
  const btnViews = { x: cx + (843 - crop.x + 30) * sc, y: cy + (579 - crop.y) * sc };
  const btnFollowers = { x: cx + (984 - crop.x + 30) * sc, y: cy + (579 - crop.y) * sc };
  const t1 = Math.round((clickAt - (clickAt - 400)) / MS_PER_FRAME); // frame the first click lands
  const t2 = t1 + Math.round(900 / MS_PER_FRAME);
  return (
    <AbsoluteFill>
      <UICard clip="competitors-click" ms={ms} crop={{ x: 288, y: 220, w: 1352, h: 215 }} scale={1.1 * s} x={size.w * 0.5 - (1352 * 1.1 * s) / 2} y={size.h * 0.08} tilt={{ rx: 8, ry: 0 }} from={0} glow={false} />
      <UICard clip="competitors-click" ms={ms} crop={crop} scale={sc} x={cx} y={cy + size.h * 0.06} tilt={{ rx: 3, ry: -6 }} from={6} />
      <Cursor keys={[{ f: 6, x: size.w * 0.62, y: size.h * 0.9 }, { f: t1 - 2, x: btnViews.x, y: btnViews.y + size.h * 0.06 }, { f: t1, x: btnViews.x, y: btnViews.y + size.h * 0.06, click: true }, { f: t2 - 2, x: btnFollowers.x, y: btnFollowers.y + size.h * 0.06 }, { f: t2, x: btnFollowers.x, y: btnFollowers.y + size.h * 0.06, click: true }]} size={54 * s} />
    </AbsoluteFill>
  );
};

const UploadScene: React.FC<{ size: Size }> = ({ size }) => {
  const f = useCurrentFrame();
  const s = size.w / 1920;
  const scoreAt = marker("scorer", "score-visible");
  const rampFrames = S(1.6);
  const ms = f < rampFrames ? 400 + (scoreAt - 300 - 400) * Math.pow(f / rampFrames, 1.4) : scoreAt - 300 + (f - rampFrames) * MS_PER_FRAME;
  const sc = 1.22 * s;
  return (
    <AbsoluteFill>
      <UICard clip="scorer" ms={ms} crop={{ x: 252, y: 190, w: 440, h: 800 }} scale={1.0 * s} x={size.w * 0.04} y={size.h * 0.08} tilt={{ rx: 4, ry: 12, rz: -1 }} from={0} />
      <UICard clip="scorer" ms={ms} crop={{ x: 708, y: 245, w: 1050, h: 480 }} scale={sc} x={size.w * 0.3} y={size.h * 0.22} tilt={{ rx: 4, ry: -9, rz: 1 }} from={8} />
    </AbsoluteFill>
  );
};

const FixScene: React.FC<{ size: Size }> = ({ size }) => {
  const f = useCurrentFrame();
  const s = size.w / 1920;
  const fixAt = marker("scorer", "fix-click");
  const ms = fixAt - 900 + f * MS_PER_FRAME;
  const crop = { x: 708, y: 735, w: 1050, h: 345 };
  const sc = 1.5 * s;
  const cx = size.w * 0.5 - (crop.w * sc) / 2;
  const cy = size.h * 0.5 - (crop.h * sc) / 2 + size.h * 0.02;
  const btn = { x: cx + (830 - crop.x) * sc, y: cy + (910 - crop.y) * sc };
  const tClick = Math.round(900 / MS_PER_FRAME);
  return (
    <AbsoluteFill>
      <UICard clip="scorer" ms={ms} crop={{ x: 252, y: 190, w: 440, h: 800 }} scale={0.5 * s} x={size.w * 0.05} y={size.h * 0.12} tilt={{ rx: 3, ry: 14, rz: -2 }} from={0} glow={false} />
      <UICard clip="scorer" ms={ms} crop={crop} scale={sc} x={cx + size.w * 0.06} y={cy} tilt={{ rx: 3, ry: -7 }} from={4} />
      <Cursor keys={[{ f: 4, x: size.w * 0.7, y: size.h * 0.95 }, { f: tClick - 2, x: btn.x + size.w * 0.06, y: btn.y }, { f: tClick, x: btn.x + size.w * 0.06, y: btn.y, click: true }]} size={54 * s} />
    </AbsoluteFill>
  );
};

const DashboardScene: React.FC<{ size: Size }> = ({ size }) => {
  const f = useCurrentFrame();
  const s = size.w / 1920;
  const drift = interpolate(f, [0, S(3)], [0, -40 * s], { extrapolateRight: "clamp", easing: EASE });
  const cards: Crop[] = [
    { x: 253, y: 298, w: 490, h: 300 },
    { x: 759, y: 298, w: 490, h: 300 },
    { x: 1265, y: 298, w: 490, h: 300 },
  ];
  const sc = 1.05 * s;
  const gap = 34 * s;
  const total = cards.length * cards[0].w * sc + (cards.length - 1) * gap;
  return (
    <AbsoluteFill>
      {cards.map((c, i) => (
        <UICard key={i} clip="dashboard" ms={3000} crop={c} scale={sc} x={size.w * 0.5 - total / 2 + i * (c.w * sc + gap) + drift * (i - 1)} y={size.h * 0.5 - (c.h * sc) / 2 + (i === 1 ? -30 * s : 20 * s)} tilt={{ rx: 5, ry: i === 0 ? 10 : i === 2 ? -10 : 0, rz: 0 }} from={i * 5} />
      ))}
    </AbsoluteFill>
  );
};

const AskScene: React.FC<{ size: Size }> = ({ size }) => {
  const f = useCurrentFrame();
  const s = size.w / 1920;
  const typingAt = marker("chat", "typing");
  const sendAt = marker("chat", "send");
  const doneAt = marker("chat", "answer-done");
  const typeFrames = Math.round((sendAt - typingAt) / 3 / MS_PER_FRAME);
  const ms = f < typeFrames ? typingAt + f * MS_PER_FRAME * 3 : doneAt - 900 + (f - typeFrames) * MS_PER_FRAME;
  const crop = { x: 1400, y: 0, w: 520, h: 1080 };
  const sc = 1.08 * s * (size.h / 1080);
  const cx = size.w * 0.5 - (crop.w * sc) / 2;
  const cy = size.h * 0.5 - (crop.h * sc) / 2;
  const send = { x: cx + (1878 - crop.x) * sc, y: cy + (993 - crop.y) * sc };
  return (
    <AbsoluteFill>
      <UICard clip="chat" ms={ms} crop={crop} scale={sc} x={cx} y={cy} tilt={{ rx: 2, ry: -6 }} from={0} />
      <Cursor keys={[{ f: 0, x: size.w * 0.75, y: size.h * 0.85 }, { f: typeFrames - 4, x: send.x, y: send.y }, { f: typeFrames, x: send.x, y: send.y, click: true }, { f: typeFrames + 30, x: size.w * 0.78, y: size.h * 0.7 }]} size={54 * s} />
    </AbsoluteFill>
  );
};

const ReceiptsScene: React.FC<{ size: Size }> = ({ size }) => {
  const s = size.w / 1920;
  const ms = CLIPS.chat.durationMs - 200;
  return (
    <AbsoluteFill>
      <Title size={size} lines={[[{ t: "Answers" }], [{ t: "with", i: true }, { t: "receipts.", a: true }]]} x={size.w * 0.06} y={size.h * 0.34} align="left" scale={0.95} />
      <UICard clip="chat" ms={ms} crop={{ x: 1440, y: 270, w: 470, h: 520 }} scale={1.0 * s * (size.h / 1080)} x={size.w * 0.5} y={size.h * 0.14} tilt={{ rx: 3, ry: -10, rz: 1 }} from={6} />
    </AbsoluteFill>
  );
};

const PlanScene: React.FC<{ size: Size }> = ({ size }) => {
  const s = size.w / 1920;
  const ms = CLIPS.chat.durationMs - 200;
  const crop = { x: 1450, y: 785, w: 440, h: 80 };
  const sc = 1.7 * s;
  const cx = size.w * 0.5 - (crop.w * sc) / 2;
  const cy = size.h * 0.56;
  const btn = { x: cx + (1770 - crop.x) * sc, y: cy + (805 - crop.y) * sc };
  return (
    <AbsoluteFill>
      <Title size={size} lines={[[{ t: "Then it" }, { t: "builds", i: true }], [{ t: "the plan.", a: true }]]} y={size.h * 0.16} />
      <UICard clip="chat" ms={ms} crop={crop} scale={sc} x={cx} y={cy} tilt={{ rx: 6, ry: -4 }} from={8} />
      <Cursor keys={[{ f: 8, x: size.w * 0.3, y: size.h * 0.92 }, { f: 40, x: btn.x, y: btn.y }, { f: 44, x: btn.x, y: btn.y, click: true }]} size={54 * s} />
    </AbsoluteFill>
  );
};

const FormulaScene: React.FC<{ size: Size }> = ({ size }) => {
  const items = ["Competitor intelligence", "Pre-post scoring", "Ask SOCIA · your data", "Weekly content plan", "Calendar & publishing"];
  return (
    <AbsoluteFill>
      <Title size={size} lines={[[{ t: "All in" }], [{ t: "one", i: true }, { t: "engine.", a: true }]]} x={size.w * 0.07} y={size.h * 0.33} align="left" scale={1.05} />
      <div style={{ position: "absolute", left: size.w * 0.55, top: size.h * 0.22, display: "flex", flexDirection: "column", gap: size.h * 0.035, padding: size.h * 0.05, borderRadius: 28, background: "rgba(11,18,32,0.55)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 50px 120px -30px rgba(0,0,0,0.7)" }}>
        <Lockup size={size.h * 0.06} />
        {items.map((it, i) => (
          <Pill key={it} text={it} from={10 + i * 6} style={{ fontSize: size.h * 0.034, padding: `${size.h * 0.012}px ${size.h * 0.022}px` }} />
        ))}
      </div>
    </AbsoluteFill>
  );
};

const Icon: React.FC<{ kind: "scan" | "score" | "ask"; size: number }> = ({ kind, size }) => {
  const st = { stroke: "#B9B0FF", strokeWidth: 1.8, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      {kind === "scan" && (<><circle cx="11" cy="11" r="7" {...st} /><path d="M20 20l-3.5-3.5M8 11h6M11 8v6" {...st} /></>)}
      {kind === "score" && (<><path d="M12 3a9 9 0 1 1-6.4 2.6" {...st} /><path d="M12 12l4-4" {...st} /><circle cx="12" cy="12" r="1.4" fill="#B9B0FF" /></>)}
      {kind === "ask" && (<><path d="M4 5h16v11H9l-5 4z" {...st} /><path d="M8 9h8M8 12h5" {...st} /></>)}
    </svg>
  );
};

const TeamScene: React.FC<{ size: Size }> = ({ size }) => {
  const f = useCurrentFrame();
  const feats: { k: "scan" | "score" | "ask"; l: string }[] = [
    { k: "scan", l: "Market scan &\ncompetitor intel" },
    { k: "score", l: "Scored before\nyou post" },
    { k: "ask", l: "Ask SOCIA\non your data" },
  ];
  const d = size.h * 0.2;
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", top: size.h * 0.2, left: 0, width: size.w, display: "flex", justifyContent: "center", gap: size.w * 0.08 }}>
        {feats.map((ft, i) => {
          const p = spring({ frame: f - i * 8, fps: FPS, config: { damping: 14, stiffness: 120 } });
          return (
            <div key={ft.k} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: size.h * 0.03, opacity: p, transform: `translateY(${(1 - p) * 40}px)` }}>
              <div style={{ width: d, height: d, borderRadius: d / 2, display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(circle at 40% 35%, rgba(123,108,246,0.55), rgba(11,18,32,0.7))", border: "2px solid rgba(185,176,255,0.7)", boxShadow: "0 30px 80px -20px rgba(123,108,246,0.8)" }}>
                <Icon kind={ft.k} size={d * 0.48} />
              </div>
              <div style={{ fontFamily: FONT, fontSize: size.h * 0.03, color: BRAND.text, textAlign: "center", whiteSpace: "pre-line", fontWeight: 600, lineHeight: 1.3 }}>{ft.l}</div>
            </div>
          );
        })}
      </div>
      <Title size={size} lines={[[{ t: "and it keeps" }, { t: "learning.", i: true, a: true }]]} y={size.h * 0.72} scale={0.8} from={26} />
    </AbsoluteFill>
  );
};

const EndScene: React.FC<{ size: Size }> = ({ size }) => {
  const f = useCurrentFrame();
  const url = interpolate(f, [S(1.6), S(2.2)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", top: size.h * 0.17, left: 0, width: size.w, display: "flex", justifyContent: "center" }}>
        <Lockup size={size.h * 0.09} />
      </div>
      <Title size={size} lines={[[{ t: "Know what to post" }], [{ t: "before", i: true, a: true }, { t: "you post it." }]]} y={size.h * 0.38} from={8} />
      <div style={{ position: "absolute", top: size.h * 0.72, left: 0, width: size.w, display: "flex", flexDirection: "column", alignItems: "center", gap: size.h * 0.02, opacity: url, fontFamily: FONT }}>
        <span style={{ fontSize: size.h * 0.036, color: BRAND.muted }}>socia-concierge.vercel.app</span>
        <span style={{ fontSize: size.h * 0.016, letterSpacing: "0.3em", textTransform: "uppercase", color: "#B9B0FF", border: "1px solid rgba(185,176,255,0.6)", borderRadius: 999, padding: "8px 16px 7px 19px" }}>Early access</span>
      </div>
    </AbsoluteFill>
  );
};

/* ---------------- timeline ---------------- */

type Beat = { at: number; dur: number; el: (size: Size) => React.ReactNode; name: string };

const beats: Beat[] = [
  { name: "logo", at: 0, dur: 2, el: (s) => <IntroLogo size={s} /> },
  { name: "hero", at: 2, dur: 2.4, el: (s) => <Hero size={s} /> },
  { name: "title · engine", at: 4.4, dur: 2.4, el: (s) => <Title size={s} lines={[[{ t: "The intelligence engine" }], [{ t: "for", i: true }, { t: "creators & brands.", a: true }]]} /> },
  { name: "ui · competitors", at: 6.8, dur: 3.2, el: (s) => <CompetitorsScene size={s} /> },
  { name: "title · winning", at: 10, dur: 2.2, el: (s) => <Title size={s} lines={[[{ t: "See who's winning" }], [{ t: "— and", i: true }, { t: "why.", a: true }]]} /> },
  { name: "ui · upload+score", at: 12.2, dur: 4.2, el: (s) => <UploadScene size={s} /> },
  { name: "title · scored", at: 16.4, dur: 2.2, el: (s) => <Title size={s} lines={[[{ t: "Scored" }, { t: "before", i: true, a: true }], [{ t: "you post." }]]} /> },
  { name: "ui · fix", at: 18.6, dur: 3.2, el: (s) => <FixScene size={s} /> },
  { name: "title · fixes", at: 21.8, dur: 2, el: (s) => <Title size={s} lines={[[{ t: "Top 3 fixes," }], [{ t: "ranked.", i: true, a: true }]]} /> },
  { name: "ui · dashboard", at: 23.8, dur: 3, el: (s) => <DashboardScene size={s} /> },
  { name: "title · ask", at: 26.8, dur: 2, el: (s) => <Title size={s} lines={[[{ t: "Ask anything." }], [{ t: "Your", i: true }, { t: "data.", a: true }]]} /> },
  { name: "ui · ask", at: 28.8, dur: 4, el: (s) => <AskScene size={s} /> },
  { name: "receipts", at: 32.8, dur: 2.6, el: (s) => <ReceiptsScene size={s} /> },
  { name: "plan", at: 35.4, dur: 2.6, el: (s) => <PlanScene size={s} /> },
  { name: "formula", at: 38, dur: 2.8, el: (s) => <FormulaScene size={s} /> },
  { name: "team", at: 40.8, dur: 2.6, el: (s) => <TeamScene size={s} /> },
  { name: "end", at: 43.4, dur: 1.6, el: (s) => <EndScene size={s} /> },
];

export const ScreenDemo: React.FC<{ w: number; h: number }> = ({ w, h }) => {
  const size = { w, h };
  return (
    <div style={{ position: "relative", width: w, height: h, overflow: "hidden", background: BRAND.bg }}>
      <Bg size={size} />
      {beats.map((b) => (
        <Sequence key={b.name} from={S(b.at)} durationInFrames={S(b.dur)} name={b.name}>
          <BeatFade dur={S(b.dur)}>{b.el(size)}</BeatFade>
        </Sequence>
      ))}
    </div>
  );
};

/** Beats cut hard on entry (elements spring in) and fade 6 frames at the tail. */
const BeatFade: React.FC<{ dur: number; children: React.ReactNode }> = ({ dur, children }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [dur - 6, dur - 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};
