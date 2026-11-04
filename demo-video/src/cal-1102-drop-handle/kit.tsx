// Shared pieces for the cal-* calendar reels (Nov 2026): SOCIA tokens, fonts, easing,
// the word-by-word caption, EXAMPLE chip and source line. Copied from
// src/daily-2026-11-01-pm/Reel.tsx so these reels don't depend on another folder changing.
import React from "react";
import { Easing, Img, interpolate, useCurrentFrame } from "remotion";
import { loadFont } from "@remotion/google-fonts/InterTight";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import mark from "../brand/socia-mark.png";

const inter = loadFont("normal", { weights: ["500", "600", "700", "800"], subsets: ["latin"] });
const mono = loadMono("normal", { weights: ["500", "600"], subsets: ["latin"] });
export const SANS = `${inter.fontFamily}, Inter, sans-serif`;
export const MONO = `${mono.fontFamily}, Menlo, monospace`;

// app/styles/tokens.css: warm paper, near-black ink, gold accent, cobalt for data only.
export const PAPER = "#f6f4ef";
export const CARD = "#ffffff";
export const INK = "#17191d";
export const INK2 = "#5f646c";
export const INK3 = "#8b9097";
export const LINE = "#e4e1da";
export const GOLD = "#8a6a2c";
export const GOLD_BRIGHT = "#d9b25c";
export const COBALT = "#2a62f5";
export const GREEN = "#1f8a4c";
export const RED = "#b3402f";
export const NIGHT = "#0d0e10";

export const FPS = 30;
export const useT = () => useCurrentFrame() / FPS;
export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const ease = (t: number, at: number, dur = 0.3, e = Easing.out(Easing.cubic)) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: e });
export const popE = (t: number, at: number, dur = 0.35) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.7)) });
export const typed = (t: number, text: string, from: number, to: number) => text.slice(0, Math.round(interpolate(t, [from, to], [0, text.length], clamp)));

export type Word = { w: string; t: number; em?: boolean };
export const wd = (w: string, t: number, em = false): Word => ({ w, t, em });

/** A block that eases in (rise, fade, blur) and out (fade, blur) between two times. */
export const Beat: React.FC<{ at: number; until?: number; children: React.ReactNode }> = ({ at, until = 999, children }) => {
  const t = useT();
  if (t < at - 0.02 || t > until + 0.02) return null;
  const pin = ease(t, at, 0.32);
  const pout = 1 - ease(t, until - 0.2, 0.2, Easing.in(Easing.cubic));
  return <div style={{ position: "absolute", inset: 0, opacity: Math.min(pin, pout), filter: `blur(${(1 - pin) * 10 + (1 - pout) * 8}px)`, transform: `translateY(${(1 - pin) * 24}px)` }}>{children}</div>;
};

/**
 * Word-by-word caption: each word eases in over 0.3 s (rise, fade, light blur) at its
 * spoken time; nothing shows before it is said. A finished line fades up and out just
 * before the next line's first word.
 */
export const WordCaption: React.FC<{
  phrases: Word[][];
  from: number;
  to: number;
  top: number;
  size?: number;
  color?: string;
  em?: string;
  align?: "center" | "left";
  weight?: number;
  side?: number;
  lineHeight?: number;
  tracking?: number;
}> = ({ phrases, from, to, top, size = 52, color = INK, em = GOLD, align = "center", weight = 700, side = 100, lineHeight = 1.22, tracking = -0.8 }) => {
  const t = useT();
  if (t < from || t >= to) return null;
  const idx = phrases.reduce((v, ph, i) => (t >= ph[0].t - 0.03 ? i : v), -1);
  if (idx < 0) return null;
  const ph = phrases[idx];
  const next = phrases[idx + 1];
  const end = next ? next[0].t : to;
  const out = ease(t, end - 0.18, 0.15);
  return (
    <div style={{ position: "absolute", top, left: side, right: side, textAlign: align, fontFamily: SANS, fontWeight: weight, fontSize: size, lineHeight, letterSpacing: tracking, color, opacity: 1 - out, transform: `translateY(${-14 * out}px)` }}>
      {ph.map((w, i) => {
        const p = ease(t, w.t, 0.3);
        if (p <= 0) return null;
        return <span key={i} style={{ display: "inline-block", marginRight: "0.24em", opacity: p, transform: `translateY(${(1 - p) * 16}px)`, filter: `blur(${(1 - p) * 6}px)`, color: w.em ? em : color }}>{w.w}</span>;
      })}
    </div>
  );
};

export const ExampleChip: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <span style={{ fontFamily: MONO, fontSize: size, fontWeight: 600, letterSpacing: 2, color: "#7a5600", background: "#fbecc4", border: "1px solid #e8c771", borderRadius: 8, padding: "3px 10px", whiteSpace: "nowrap" }}>EXAMPLE</span>
);

export const Mark: React.FC<{ size: number }> = ({ size }) => <Img src={mark} style={{ width: size, height: size, borderRadius: size * 0.24 }} />;

/** Where a number came from, always on screen with it. */
export const Source: React.FC<{ text: string; dark?: boolean; size?: number }> = ({ text, dark = false, size = 20 }) => (
  <div style={{ fontFamily: MONO, fontSize: size, fontWeight: 500, letterSpacing: 0.5, color: dark ? "rgba(255,255,255,0.6)" : INK2 }}>{text}</div>
);
