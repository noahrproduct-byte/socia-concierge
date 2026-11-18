"use client";

// A graphic scene (lib/studioClips/scenes.ts): a designed card over the top of
// the picture that comes on with the words it shows.
//   stat   the figure counts up to the number that was said and lands big in
//          the cut's accent, a rule draws out from the middle, and what it
//          counts sits under it in spaced capitals;
//   steps  a checklist: each row slides in as its line is said, its number
//          fills with the accent, and a track down the side fills to the row
//          being said;
//   line   the sentence arrives word by word, then the word that carries it is
//          boxed in the accent.
// An accent bar draws down the card's edge as it lands; it leaves by lifting
// away. Driven by the frame only, in the plain styles the lower third and the
// ranking use (no filters, no gradients), so the Player, a scrub and the
// browser export draw the same frame.
import React from "react";
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { readableOn, safeZoneFor } from "@/lib/textPresets";
import type { SceneSpan } from "@/lib/studioClips/scenes";

const OUT_FRAMES = 7;
const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const EASE = { ...CLAMP, easing: Easing.out(Easing.cubic) } as const;
const CARD = "rgba(9,10,13,0.88)";
const EDGE = "rgba(255,255,255,0.14)";
const POINT = /^(free|save|secret|never|nobody|stop|mistake|best|worst|why|truth|wrong|only|every|always|without|nothing|everything|biggest|fastest|easiest)$/i;
const SMALL = /^(a|an|the|and|or|but|so|to|of|in|on|at|is|it|its|that|this|we|i|you|they|he|she|for|with|as|by|be|are|was|were|way|does|do)$/i;

/** A figure as it was said, counted up to: "$1,500" at 40% is "$600". A figure that is not a plain number is shown as it is. */
export function countTo(text: string, share: number): string {
  const m = text.match(/^([^\d]*)(\d[\d,]*)(\.\d+)?(.*)$/);
  if (!m || share >= 1) return text;
  const [, pre, whole, frac = "", post] = m;
  const target = Number(whole.replace(/,/g, "") + frac);
  if (!Number.isFinite(target)) return text;
  const decimals = frac ? frac.length - 1 : 0;
  const n = target * Math.max(0, share);
  const shown = decimals ? n.toFixed(decimals) : String(Math.round(n));
  const [w, d] = shown.split(".");
  const grouped = whole.includes(",") ? w.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : w;
  return `${pre}${grouped}${d ? `.${d}` : ""}${post}`;
}

export function SceneLayer({ span, fontFamily, accent, low }: {
  span: SceneSpan; fontFamily: string;
  /** the cut's accent: the figure, the bar, the row numbers, the boxed word */
  accent: string;
  /** captions sit at the top of this cut, so the card sits lower */
  low?: boolean;
}) {
  const f = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const zone = safeZoneFor(width, height);
  const s = Math.min(width, height) / 1080;
  const { scene } = span;
  const land = spring({ frame: f, fps, config: { damping: 15, stiffness: 160 }, durationInFrames: 14 });
  const leave = interpolate(f, [span.durationInFrames - OUT_FRAMES, span.durationInFrames], [0, 1], CLAMP);
  const on = readableOn(accent);
  const card: React.CSSProperties = {
    // Centred in the frame: the top of the picture is clear of the apps' buttons, which sit lower on the right.
    position: "absolute", left: zone.x, top: zone.y + (low ? zone.height * 0.3 : 0), width: width - zone.x * 2, boxSizing: "border-box",
    padding: `${40 * s}px ${44 * s}px ${40 * s}px ${58 * s}px`, borderRadius: 34 * s, backgroundColor: CARD, border: `${Math.max(1, Math.round(2 * s))}px solid ${EDGE}`,
    color: "#fff", fontFamily, overflow: "hidden",
    opacity: Math.min(1, f / 3) * (1 - leave), transform: `translateY(${((1 - land) * -36 - leave * 24) * s}px) scale(${0.96 + 0.04 * land})`,
  };
  // The accent bar down the card's left edge, drawn as the card lands.
  const bar = <div style={{ position: "absolute", left: 0, top: 0, width: 14 * s, height: `${interpolate(f, [2, 14], [0, 100], EASE)}%`, backgroundColor: accent }} />;

  if (scene.kind === "stat") {
    const size = scene.text.length <= 4 ? 236 : scene.text.length <= 7 ? 172 : 124;
    const share = interpolate(f, [2, 18], [0, 1], EASE);
    return (
      <div style={{ ...card, textAlign: "center" }}>
        {bar}
        <div style={{ fontSize: size * s, lineHeight: 1, fontWeight: 800, letterSpacing: `${-0.03 * size * s}px`, color: accent, transform: `scale(${0.8 + 0.2 * land})` }}>{countTo(scene.text, share)}</div>
        <div style={{ margin: `${22 * s}px auto 0`, height: Math.max(3, Math.round(6 * s)), width: `${interpolate(f, [8, 22], [0, 46], EASE)}%`, borderRadius: 999, backgroundColor: "#fff", opacity: 0.9 }} />
        {scene.label && <div style={{ marginTop: 22 * s, fontSize: 50 * s, lineHeight: 1.15, fontWeight: 800, textTransform: "uppercase", letterSpacing: `${0.05 * 50 * s}px`, opacity: interpolate(f, [10, 18], [0, 1], CLAMP), transform: `translateY(${interpolate(f, [10, 18], [14, 0], EASE) * s}px)` }}>{scene.label}</div>}
      </div>
    );
  }

  if (scene.kind === "steps") {
    const current = span.rows.reduce((at, r, i) => (f >= r.at ? i : at), 0);
    const chip = 72 * s, gap = 22 * s;
    // The track fills from the first number to the one being said.
    const filled = span.rows.length > 1 ? span.rows.reduce((h, r, i) => (i === 0 ? 0 : h + interpolate(f, [r.at, r.at + 8], [0, 1], EASE)), 0) / (span.rows.length - 1) : 0;
    return (
      <div style={{ ...card, display: "flex", flexDirection: "column", gap }}>
        {bar}
        {span.rows.length > 1 && (
          <div style={{ position: "absolute", left: 58 * s + chip / 2 - 3 * s, top: 40 * s + chip / 2, bottom: 40 * s + chip / 2, width: 6 * s, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.16)" }}>
            <div style={{ width: "100%", height: `${filled * 100}%`, borderRadius: 999, backgroundColor: accent }} />
          </div>
        )}
        {span.rows.map((r, i) => {
          const p = interpolate(f, [r.at, r.at + 7], [0, 1], EASE);
          const pop = spring({ frame: f - r.at, fps, config: { damping: 11, stiffness: 190 }, durationInFrames: 12 });
          const now = i === current;
          return (
            <div key={i} style={{ position: "relative", display: "flex", alignItems: "center", gap: 24 * s, opacity: p }}>
              <span style={{ flex: "none", width: chip, height: chip, borderRadius: 999, backgroundColor: accent, color: on, fontSize: 42 * s, fontWeight: 800, lineHeight: `${chip}px`, textAlign: "center", transform: `scale(${0.5 + 0.5 * pop})` }}>{i + 1}</span>
              <span style={{ fontSize: 60 * s, lineHeight: 1.15, fontWeight: 800, opacity: now ? 1 : 0.6, transform: `translateX(${(1 - p) * -30 * s}px)` }}>{r.text}</span>
            </div>
          );
        })}
      </div>
    );
  }

  const parts = scene.text.split(" ").filter(Boolean);
  const size = scene.text.length <= 26 ? 92 : 74;
  // The word that carries the line: its point word ("nobody", "never", "best"), else its longest word that is not a small one.
  const bareWords = parts.map((w) => w.replace(/[^\p{L}\p{N}']/gu, ""));
  let key = bareWords.findIndex((w) => POINT.test(w));
  if (key < 0) key = bareWords.reduce((best, w, i) => (!SMALL.test(w) && w.length > (best < 0 ? 0 : bareWords[best].length) ? i : best), -1);
  if (key < 0) key = parts.length - 1;
  const boxAt = parts.length * 3 + 4;
  const box = interpolate(f, [boxAt, boxAt + 8], [0, 1], EASE);
  return (
    <div style={card}>
      {bar}
      <div style={{ display: "flex", flexWrap: "wrap", columnGap: 18 * s, rowGap: 10 * s, fontSize: size * s, lineHeight: 1.16, fontWeight: 800, letterSpacing: `${-0.01 * size * s}px` }}>
        {parts.map((w, i) => {
          const p = interpolate(f, [i * 3, i * 3 + 6], [0, 1], EASE);
          const style: React.CSSProperties = { position: "relative", opacity: p, transform: `translateY(${(1 - p) * 22 * s}px)` };
          if (i !== key) return <span key={i} style={style}>{w}</span>;
          return (
            <span key={i} style={{ ...style, padding: `0 ${12 * s}px`, margin: `0 ${-12 * s}px`, color: box > 0.5 ? on : "#fff" }}>
              <span style={{ position: "absolute", left: 0, top: "6%", height: "88%", width: `${box * 100}%`, borderRadius: 12 * s, backgroundColor: accent }} />
              <span style={{ position: "relative" }}>{w}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
