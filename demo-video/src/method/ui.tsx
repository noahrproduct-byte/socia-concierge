import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/InterTight";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as loadScript } from "@remotion/google-fonts/Caveat";
import { FPS, FOOTER, HEADER, W, H } from "./script";

const display = loadDisplay("normal", { weights: ["600", "800"], subsets: ["latin"] });
const mono = loadMono("normal", { weights: ["500", "600"], subsets: ["latin"] });
const script = loadScript("normal", { weights: ["600"], subsets: ["latin"] });

export const FONT = {
  display: `${display.fontFamily}, "Inter Tight", Inter, sans-serif`,
  mono: `${mono.fontFamily}, "JetBrains Mono", Menlo, monospace`,
  script: `${script.fontFamily}, "Caveat", cursive`,
};

// The reference reel's frame with SOCIA's tokens: near-black ground, warm white ink,
// and the app's cobalt (--accent #2563ff) wherever the reference used orange. The
// key is still called `gold` so the layout code reads the same.
export const C = {
  bg: "#0b0a09",
  ink: "#f2efe9",
  ink2: "rgba(242,239,233,0.62)",
  ink3: "rgba(242,239,233,0.34)",
  gold: "#3b7cff",
  goldDim: "rgba(59,124,255,0.22)",
  goldLine: "rgba(59,124,255,0.55)",
  panel: "rgba(255,255,255,0.045)",
  panelLine: "rgba(255,255,255,0.09)",
  cell: "rgba(255,255,255,0.05)",
  cellTint: "rgba(59,124,255,0.22)",
};

export const GLOW = `0 0 18px rgba(59,124,255,0.6), 0 0 54px rgba(59,124,255,0.3)`;
export const BOX_GLOW = `0 0 24px rgba(59,124,255,0.38), 0 0 70px rgba(59,124,255,0.18)`;

export const sec = (s: number) => Math.round(s * FPS);
const outCubic = Easing.out(Easing.cubic);

/** Eased 0..1 progress for a reveal that starts at `at` seconds and lasts `dur` frames. */
export function useProgress(at: number, dur = 8): number {
  const f = useCurrentFrame();
  return interpolate(f - sec(at), [0, dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: outCubic });
}

export function progressAt(frame: number, at: number, dur = 8, easing = outCubic): number {
  return interpolate(frame - sec(at), [0, dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing });
}

/** Fade + 16px rise. The reel's default reveal for every element. */
export const Reveal: React.FC<{ at: number; dur?: number; rise?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({ at, dur = 8, rise = 16, style, children }) => {
  const p = useProgress(at, dur);
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * rise}px)`, ...style }}>{children}</div>;
};

/** Scale-in pop used for hubs, chips and winning cells. */
export const Pop: React.FC<{ at: number; dur?: number; from?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({ at, dur = 9, from = 0.6, style, children }) => {
  const f = useCurrentFrame();
  const p = interpolate(f - sec(at), [0, dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.back(1.6)) });
  const o = interpolate(f - sec(at), [0, 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <div style={{ opacity: o, transform: `scale(${from + (1 - from) * p})`, ...style }}>{children}</div>;
};

/** The chapter frame: background, grid, warm glow, header and footer. Blur-in on entry. */
export const Scene: React.FC<{ n: number; children: React.ReactNode }> = ({ n, children }) => {
  const f = useCurrentFrame();
  const inP = interpolate(f, [0, 5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: outCubic });
  const blur = (1 - inP) * 22;
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: FONT.display, color: C.ink }}>
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)`,
          backgroundSize: "72px 72px",
          backgroundPosition: "36px 0",
        }}
      />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 38% at 50% 66%, rgba(59,124,255,0.14), rgba(59,124,255,0) 100%)` }} />
      <AbsoluteFill style={{ filter: `blur(${blur}px)`, opacity: inP, transform: `scale(${1 + (1 - inP) * 0.02})` }}>
        <div style={{ position: "absolute", top: 206, left: 60, right: 60, display: "flex", justifyContent: "space-between", fontFamily: FONT.mono, fontSize: 19, letterSpacing: 2, color: C.gold, fontWeight: 500 }}>
          <span>{HEADER.left}</span>
          <span>{String(n).padStart(2, "0")} / {String(HEADER.total).padStart(2, "0")}</span>
        </div>
        <div style={{ position: "absolute", top: 1584, left: 60, right: 60, display: "flex", justifyContent: "space-between", fontFamily: FONT.mono, fontSize: 19, letterSpacing: 3, color: C.ink3, fontWeight: 500 }}>
          <span>{FOOTER.left}</span>
          <span>{FOOTER.right}</span>
        </div>
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const StepChip: React.FC<{ label: string; top?: number }> = ({ label, top = 240 }) => (
  <div style={{ position: "absolute", top, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
    <span style={{ fontFamily: FONT.mono, fontSize: 24, letterSpacing: 4, fontWeight: 600, color: C.ink, background: "rgba(255,255,255,0.08)", border: `1px solid ${C.panelLine}`, borderRadius: 10, padding: "10px 24px" }}>{label}</span>
  </div>
);

/** Two-beat title: white line lands first, the gold line nine frames later. */
export const Title: React.FC<{ line1: string; line2: string; top: number; at?: number; size1?: number; size2?: number; children?: React.ReactNode }> = ({ line1, line2, top, at = 0, size1 = 78, size2 = 122, children }) => (
  <div style={{ position: "absolute", top, left: 40, right: 40, textAlign: "center", lineHeight: 1 }}>
    {children}
    <Reveal at={at} rise={14}>
      <div style={{ fontSize: size1, fontWeight: 800, letterSpacing: -2, textShadow: "0 0 30px rgba(242,239,233,0.25)" }}>{line1}</div>
    </Reveal>
    <Reveal at={at + 9 / FPS} rise={14}>
      <div style={{ fontSize: size2, fontWeight: 800, letterSpacing: -3, color: C.gold, textShadow: GLOW, marginTop: 6 }}>{line2}</div>
    </Reveal>
  </div>
);

export const Script: React.FC<{ at: number; top: number; size?: number; children: React.ReactNode }> = ({ at, top, size = 44, children }) => (
  <Reveal at={at} style={{ position: "absolute", top, left: 40, right: 40, textAlign: "center" }}>
    <div style={{ fontFamily: FONT.script, fontSize: size, fontWeight: 600, color: C.ink, transform: "rotate(-1.5deg)" }}>{children}</div>
  </Reveal>
);

export const Body: React.FC<{ at: number; top: number; children: React.ReactNode }> = ({ at, top, children }) => (
  <Reveal at={at} style={{ position: "absolute", top, left: 90, right: 90, textAlign: "center" }}>
    <div style={{ fontSize: 33, fontWeight: 600, lineHeight: 1.4, color: C.ink2 }}>{children}</div>
  </Reveal>
);

export const B: React.FC<{ children: React.ReactNode }> = ({ children }) => <b style={{ color: C.ink, fontWeight: 800 }}>{children}</b>;
export const Gold: React.FC<{ children: React.ReactNode }> = ({ children }) => <span style={{ color: C.gold, fontWeight: 800 }}>{children}</span>;

/** The one-line takeaway that closes each chapter. */
export const Caption: React.FC<{ at: number; top: number; children: React.ReactNode }> = ({ at, top, children }) => (
  <Reveal at={at} style={{ position: "absolute", top, left: 60, right: 60, textAlign: "center" }}>
    <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.3, color: C.ink, letterSpacing: -0.5 }}>{children}</div>
  </Reveal>
);

export const Mono: React.FC<{ size?: number; color?: string; style?: React.CSSProperties; children: React.ReactNode }> = ({ size = 18, color = C.ink3, style, children }) => (
  <span style={{ fontFamily: FONT.mono, fontSize: size, letterSpacing: 2, fontWeight: 500, color, textTransform: "uppercase", ...style }}>{children}</span>
);

export const GoldChip: React.FC<{ children: React.ReactNode; filled?: boolean; style?: React.CSSProperties }> = ({ children, filled = false, style }) => (
  <span
    style={{
      fontFamily: FONT.mono,
      fontSize: 18,
      letterSpacing: 2,
      fontWeight: 600,
      textTransform: "uppercase",
      color: filled ? C.bg : C.gold,
      background: filled ? C.gold : "transparent",
      border: `1.5px solid ${C.gold}`,
      borderRadius: 8,
      padding: "8px 16px",
      boxShadow: filled ? BOX_GLOW : "none",
      ...style,
    }}
  >
    {children}
  </span>
);

export const fmtK = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K` : String(Math.round(n)));
export const fmtN = (n: number): string => Math.round(n).toLocaleString("en-US");

/** The Instagram glyph: gradient rounded square, ring, dot. */
export const InstagramIcon: React.FC<{ size?: number }> = ({ size = 56 }) => (
  <svg width={size} height={size} viewBox="0 0 56 56">
    <defs>
      <linearGradient id="igg" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor="#f9ce34" />
        <stop offset="0.5" stopColor="#ee2a7b" />
        <stop offset="1" stopColor="#6228d7" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="52" height="52" rx="14" fill="url(#igg)" />
    <rect x="12" y="12" width="32" height="32" rx="9" fill="none" stroke="#fff" strokeWidth="3.5" />
    <circle cx="28" cy="28" r="7.5" fill="none" stroke="#fff" strokeWidth="3.5" />
    <circle cx="38" cy="18" r="2.4" fill="#fff" />
  </svg>
);

export const Dashes: React.FC<{ width: number }> = ({ width }) => (
  <svg width={width} height="4" viewBox={`0 0 ${width} 4`}>
    <line x1="0" y1="2" x2={width} y2="2" stroke={C.gold} strokeWidth="3" strokeDasharray="10 10" />
  </svg>
);

export const canvas = { W, H };
