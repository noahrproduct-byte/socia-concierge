"use client";

// An effect scene (lib/studioClips/sceneFx.ts): a treatment of the whole
// frame on the word it is about. This file draws what goes over the picture
// and under the person (ClipComposition draws the person again on top for
// the effects that need it, and moves the picture for frame and reveal with
// pictureFx below):
//   ribbon  the Ribbon Depth scene (after Motus, see lib/studioClips/ribbon.ts):
//           the room dims, a glass ribbon winds behind the person, a frosted
//           card with a title and rows sits behind the head, and a line lands
//           in front of them (EffectFront, drawn above the person);
//   chat, notify, search, button, compare   the glass pieces of that style:
//           message bubbles after typing dots, a notification stack, a search
//           bar that types, a button a cursor clicks, two options side by side;
//   cover   a masthead word across the top, in a serif, with a cover line;
//   glass   one huge see-through word;
//   graph   a line chart that climbs, months along the top, a tag on its peak;
//   news    paper clippings with headlines, each landing at its own angle;
//   paper   a paper collage: scribbled blocks and cut-out letters;
//   sketch  doodles drawn in white that wobble (the line around the person is
//           the cut-out's own edge);
//   frame   a ring around the picture as it pops into a card, a line under it;
//   reveal  a window's title bar over the picture as it pulls back;
//   phone   a phone that slides in from the left, behind the person, with
//           lines on its screen.
// Driven by the frame only, plain styles and SVG, so the Player and the
// export draw the same.
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Easing, continueRender, delayRender, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { familyOf, loadEditorFont } from "@/lib/editorFonts";
import { drawRibbon, ribbonScratch, RIBBON_FORMS, type RibbonForm, type RibbonScratch } from "@/lib/studioClips/ribbon";
import { readableOn, safeZoneFor } from "@/lib/textPresets";
import type { SceneSpan } from "@/lib/studioClips/scenes";
import type { SceneFxId } from "@/lib/studioClips/sceneFx";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const EASE = { ...CLAMP, easing: Easing.out(Easing.cubic) } as const;
const OUT = 8;
const SERIF = "Georgia, 'Times New Roman', Times, serif";
const INK = "#0b0c10";

/** How far in an effect is at a frame of its scene: 0 (not there) to 1 (fully in). The picture and the person move by the same share. */
export function fxShare(f: number, frames: number, fps: number): number {
  const land = spring({ frame: f, fps, config: { damping: 200, stiffness: 150 }, durationInFrames: 14 });
  const leave = interpolate(f, [frames - OUT, frames], [0, 1], { ...CLAMP, easing: Easing.in(Easing.cubic) });
  return Math.max(0, Math.min(1, land) * (1 - leave));
}

/** What an effect does to the picture itself, at a share of the way in. */
export function pictureFx(fx: SceneFxId | undefined, share: number, width: number, height: number): { transform: string; radius: number } | null {
  if (fx === "frame") return { transform: `translateY(${-0.03 * height * share}px) scale(${1 - 0.2 * share})`, radius: 0.06 * width * share };
  if (fx === "reveal") return { transform: `translateY(${0.03 * height * share}px) scale(${1 - 0.3 * share})`, radius: 0.03 * width * share };
  return null;
}

/** The italic serif the Ribbon Depth scene sets its accent word in; the frame waits for it. */
function useAccentSerif(): string {
  const [, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    const handle = delayRender("accent serif", { timeoutInMilliseconds: 30_000 });
    loadEditorFont("serif").catch(() => null).finally(() => { if (alive) setReady(true); continueRender(handle); });
    return () => { alive = false; };
  }, []);
  return `${familyOf("serif")}, ${SERIF}`;
}

/** The glass ribbon (lib/studioClips/ribbon.ts), drawn again for every frame at two thirds of the frame's size. */
function RibbonCanvas({ form, accent, frames }: { form: RibbonForm; accent: string; frames: number }) {
  const f = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const ref = useRef<HTMLCanvasElement>(null);
  const scratch = useRef<RibbonScratch | null>(null);
  const W = 720, H = Math.round((720 * height) / width);
  useLayoutEffect(() => {
    const c = ref.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    if (!scratch.current || scratch.current.w !== W || scratch.current.h !== H) scratch.current = ribbonScratch(W, H);
    if (!scratch.current) return;
    drawRibbon(g, scratch.current, f / fps, { form, accent, leave: interpolate(f, [frames - 12, frames], [0, 1], CLAMP) });
  }, [f, fps, form, accent, frames, W, H]);
  return <canvas ref={ref} width={W} height={H} style={{ position: "absolute", left: 0, top: 0, width, height, pointerEvents: "none" }} />;
}

const CREAM = "#f9f2e6", GLASS = "rgba(244,236,229,0.88)", BROWN = "#21170f";
/** A title whose last word is the accent: set in the italic serif, a little larger. */
function Accented({ text, serif, size, accentSize, color }: { text: string; serif: string; size: number; accentSize: number; color: string }) {
  const parts = text.trim().split(/\s+/);
  const last = parts.length > 1 ? parts.pop()! : "";
  return <span style={{ fontSize: size, color }}>{parts.join(" ")}{last && <> <span style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: accentSize }}>{last}</span></>}</span>;
}

/** What an effect draws in front of the person: the Ribbon Depth scene's line (a cream capsule, then the line with one italic word, underlined). */
export function EffectFront({ span, fontFamily, accent }: { span: SceneSpan; fontFamily: string; accent: string }) {
  const f = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const serif = useAccentSerif();
  const s = width / 1080;
  const { scene } = span;
  const words = (scene.label ?? "").trim().split(/\s+/).filter(Boolean);
  if (scene.fx !== "ribbon" || !words.length) return null;
  const leave = interpolate(f, [span.durationInFrames - OUT, span.durationInFrames], [0, 1], CLAMP);
  // Four words or more: the first two sit in the capsule, the rest is the line.
  const pill = words.length >= 4 ? words.slice(0, 2).join(" ") : "";
  const line = words.length >= 4 ? words.slice(2).join(" ") : words.join(" ");
  const inn = spring({ frame: f - 6, fps, config: { damping: 200, stiffness: 140 }, durationInFrames: 14 });
  const pillIn = spring({ frame: f - 2, fps, config: { damping: 200, stiffness: 160 }, durationInFrames: 12 });
  const big = Math.min(92, (width * 0.9) / Math.max(1, line.length * 0.5) / s);
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width, height, fontFamily, opacity: 1 - leave }}>
      {pill && <div style={{ position: "absolute", left: 70 * s, top: (height / 1920) * 1150, height: 74 * s, padding: `0 ${30 * s}px`, display: "flex", alignItems: "center", borderRadius: 37 * s, backgroundColor: CREAM, color: BROWN, fontSize: 36 * s, fontWeight: 600, opacity: Math.min(1, Math.max(0, (f - 2) / 3)), transform: `translateY(${(1 - pillIn) * 30 * s}px)` }}>{pill}</div>}
      <div style={{ position: "absolute", left: 70 * s, top: (height / 1920) * 1250, width: width - 140 * s, lineHeight: 1.08, fontWeight: 500, textShadow: "0 3px 18px rgba(0,0,0,0.55)", opacity: Math.min(1, Math.max(0, (f - 6) / 3)), transform: `translateY(${(1 - inn) * 44 * s}px)` }}>
        <Accented text={line} serif={serif} size={big * s} accentSize={big * 1.26 * s} color="#fff9f2" />
        <div style={{ marginTop: 10 * s, height: Math.max(3, 6 * s), width: `${interpolate(f, [16, 30], [0, 46], EASE)}%`, borderRadius: 99, backgroundColor: accent }} />
      </div>
    </div>
  );
}

/** The Ribbon Depth scene behind the person: the room dimmed, the ribbon, and a frosted card with a title and rows that land in turn. */
function RibbonScene({ span, fontFamily, accent }: { span: SceneSpan; fontFamily: string; accent: string }) {
  const f = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const serif = useAccentSerif();
  const s = width / 1080;
  const { scene } = span;
  const share = fxShare(f, span.durationInFrames, fps);
  const rows = (scene.lines ?? []).slice(0, 3);
  const n = Number(scene.id.replace(/\D/g, "")) || 0;
  const form = RIBBON_FORMS[n % RIBBON_FORMS.length === 0 ? 0 : (n - 1) % RIBBON_FORMS.length];
  const card = spring({ frame: f - 4, fps, config: { damping: 200, stiffness: 130 }, durationInFrames: 16 });
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width, height, overflow: "hidden", fontFamily }}>
      <div style={{ position: "absolute", left: 0, top: 0, width, height, backgroundColor: "#0a0503", opacity: 0.52 * share }} />
      <RibbonCanvas form={form} accent={accent} frames={span.durationInFrames} />
      {scene.text.trim() && (
        <div style={{ position: "absolute", left: 56 * s, top: (height / 1920) * 205, width: 600 * s, boxSizing: "border-box", padding: 40 * s, borderRadius: 40 * s, backgroundColor: GLASS, border: `${Math.max(1, 2 * s)}px solid rgba(255,255,255,0.7)`, color: BROWN, opacity: Math.min(1, Math.max(0, (f - 4) / 4)) * share, transform: `translateY(${(1 - card) * 44 * s}px) scale(${0.95 + 0.05 * card})` }}>
          <div style={{ lineHeight: 1.12, fontWeight: 500 }}><Accented text={scene.text} serif={serif} size={44 * s} accentSize={54 * s} color={BROWN} /></div>
          {rows.map((r, i) => {
            const at = 14 + i * 9;
            const p = spring({ frame: f - at, fps, config: { damping: 200, stiffness: 150 }, durationInFrames: 12 });
            return (
              <div key={i} style={{ marginTop: (i ? 14 : 26) * s, height: 64 * s, padding: `0 ${18 * s}px`, display: "flex", alignItems: "center", gap: 14 * s, borderRadius: 20 * s, backgroundColor: "rgba(255,255,255,0.62)", fontSize: 30 * s, fontWeight: 500, opacity: Math.min(1, Math.max(0, (f - at) / 3)), transform: `translateX(${(1 - p) * -30 * s}px)` }}>
                <span style={{ flex: "none", width: 34 * s, height: 34 * s, borderRadius: 99, backgroundColor: accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg viewBox="0 0 24 24" width={20 * s} height={20 * s} fill="none" stroke={readableOn(accent)} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                </span>
                <span style={{ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{r}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const fit = (text: string, width: number, max: number, perChar = 0.62) => Math.min(max, width / Math.max(1, text.length * perChar));

export function EffectLayer({ span, fontFamily, accent }: { span: SceneSpan; fontFamily: string; accent: string }) {
  const f = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const zone = safeZoneFor(width, height);
  const s = width / 1080;
  const { scene } = span;
  const fx = scene.fx;
  const share = fxShare(f, span.durationInFrames, fps);
  const leave = interpolate(f, [span.durationInFrames - OUT, span.durationInFrames], [0, 1], CLAMP);
  const on = readableOn(accent);
  const text = scene.text.trim();
  const pop = (at: number) => spring({ frame: f - at, fps, config: { damping: 12, stiffness: 170 }, durationInFrames: 14 });
  const seen = (at: number) => Math.min(1, Math.max(0, (f - at) / 3)) * (1 - leave);
  const fill: React.CSSProperties = { position: "absolute", left: 0, top: 0, width, height, overflow: "hidden", fontFamily };

  if (fx === "ribbon") return <RibbonScene span={span} fontFamily={fontFamily} accent={accent} />;

  // The glass pieces of the Ribbon Depth style (after Motus's elements): the room dims behind them and the person stays in front.
  const dim = <div style={{ position: "absolute", left: 0, top: 0, width, height, backgroundColor: "#0a0503", opacity: 0.5 * share }} />;
  const top0 = (height / 1920) * 190;

  if (fx === "chat") {
    const msgs = [text, ...(scene.lines ?? [])].filter(Boolean).slice(0, 4);
    const every = Math.max(18, Math.floor((span.durationInFrames - 24) / Math.max(1, msgs.length)));
    // Stacked from the bottom of their region: a bubble that arrives pushes the ones before it up.
    const base = (height / 1920) * 760, bh = 118 * s, gap = 18 * s;
    return (
      <div style={fill}>
        {dim}
        {msgs.map((m, i) => {
          const at = 6 + i * every, right = i % 2 === 0;
          const p = spring({ frame: f - at, fps, config: { damping: 13, stiffness: 170 }, durationInFrames: 14 });
          const typing = f >= at - 12 && f < at;
          const rise = msgs.slice(i + 1).reduce((y, _m, k) => y + (bh + gap) * spring({ frame: f - (6 + (i + 1 + k) * every) + 12, fps, config: { damping: 200, stiffness: 150 }, durationInFrames: 12 }), 0);
          const side: React.CSSProperties = right ? { right: 70 * s } : { left: 70 * s };
          return (
            <React.Fragment key={i}>
              {typing && (
                <div style={{ position: "absolute", ...side, top: base - bh * 0.6, width: 120 * s, height: 64 * s, borderRadius: 32 * s, backgroundColor: right ? accent : "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 9 * s, opacity: 0.92 * (1 - leave) }}>
                  {[0, 1, 2].map((d) => <span key={d} style={{ width: 12 * s, height: 12 * s, borderRadius: 99, backgroundColor: right ? on : "#21170f", opacity: 0.35 + 0.65 * Math.abs(Math.sin((f + d * 4) / 5)) }} />)}
                </div>
              )}
              <div style={{ position: "absolute", ...side, top: base - bh - rise, maxWidth: width * 0.74, minHeight: bh, boxSizing: "border-box", padding: `${22 * s}px ${34 * s}px`, display: "flex", alignItems: "center", borderRadius: right ? `${36 * s}px ${36 * s}px ${10 * s}px ${36 * s}px` : `${36 * s}px ${36 * s}px ${36 * s}px ${10 * s}px`, backgroundColor: right ? accent : "#fffdf9", color: right ? on : "#21170f", fontSize: 44 * s, lineHeight: 1.22, fontWeight: 500, opacity: seen(at), transform: `scale(${0.6 + 0.4 * p})`, transformOrigin: right ? "100% 100%" : "0% 100%" }}>{m}</div>
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  if (fx === "notify") {
    const items = [text, ...(scene.lines ?? [])].filter(Boolean).slice(0, 4);
    const every = Math.max(16, Math.floor((span.durationInFrames - 20) / Math.max(1, items.length)));
    const th = 132 * s, gap = 18 * s;
    return (
      <div style={fill}>
        {dim}
        {items.map((it, i) => {
          const at = 4 + i * every;
          const p = spring({ frame: f - at, fps, config: { damping: 14, stiffness: 150 }, durationInFrames: 15 });
          // Newest on top: each toast sits below every one that arrived after it.
          const down = items.slice(i + 1).reduce((y, _x, k) => y + (th + gap) * spring({ frame: f - (4 + (i + 1 + k) * every), fps, config: { damping: 200, stiffness: 150 }, durationInFrames: 13 }), 0);
          const depth = items.slice(i + 1).filter((_x, k) => f >= 4 + (i + 1 + k) * every).length;
          return (
            <div key={i} style={{ position: "absolute", left: 70 * s, top: top0, width: width - 140 * s, height: th, boxSizing: "border-box", padding: `0 ${28 * s}px`, display: "flex", alignItems: "center", gap: 22 * s, borderRadius: 36 * s, backgroundColor: "#f8f3ee", color: "#21170f", opacity: seen(at) * (1 - depth * 0.12), transform: `translateY(${down + (1 - p) * -90 * s}px) scale(${(0.9 + 0.1 * p) * (1 - depth * 0.03)})` }}>
              <span style={{ flex: "none", width: th - 46 * s, height: th - 46 * s, borderRadius: 20 * s, backgroundColor: accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg viewBox="0 0 24 24" width={44 * s} height={44 * s} fill="none" stroke={on} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M13 3 5 13.5h6L10 21l8-10.5h-6z" /></svg>
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 38 * s, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it}</span>
              <span style={{ flex: "none", fontSize: 24 * s, color: "rgba(33,23,15,0.5)" }}>now</span>
            </div>
          );
        })}
      </div>
    );
  }

  if (fx === "search") {
    const query = text || "search";
    const typed = Math.floor(interpolate(f, [10, 10 + Math.min(40, query.length * 2)], [0, query.length], CLAMP));
    const inn = spring({ frame: f - 2, fps, config: { damping: 200, stiffness: 150 }, durationInFrames: 12 });
    const size = Math.min(46, (740 - 150) / Math.max(1, query.length * 0.5));
    return (
      <div style={fill}>
        {dim}
        <div style={{ position: "absolute", left: 170 * s, top: top0 + 60 * s, width: 740 * s, height: 100 * s, boxSizing: "border-box", padding: `0 ${30 * s}px`, display: "flex", alignItems: "center", gap: 18 * s, borderRadius: 60 * s, backgroundColor: "#fbf8f4", color: "#21170f", opacity: seen(2), transform: `translateY(${(1 - inn) * 22 * s}px) scale(${0.94 + 0.06 * inn})` }}>
          <svg viewBox="0 0 24 24" width={36 * s} height={36 * s} fill="none" stroke="rgba(33,23,15,0.6)" strokeWidth={2.4} strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M16.5 16.5 21 21" /></svg>
          <span style={{ fontSize: size * s, whiteSpace: "nowrap" }}>{query.slice(0, typed)}</span>
          <span style={{ width: 3 * s, height: size * 1.1 * s, marginLeft: -10 * s, borderRadius: 2, backgroundColor: "#21170f", opacity: Math.floor(f / 6) % 2 ? 1 : 0.15 }} />
        </div>
      </div>
    );
  }

  if (fx === "button") {
    const cx = width / 2, cy = (height / 1920) * 560, bw = 580 * s, bh = 150 * s;
    const click = Math.min(span.durationInFrames - 24, 36);
    const press = Math.max(0, Math.sin(Math.min(1, Math.max(0, (f - click) / 7)) * Math.PI));
    const cin = interpolate(f, [click - 16, click - 2], [0, 1], EASE);
    const rp = Math.min(1, Math.max(0, (f - click) / 27));
    const inn = spring({ frame: f - 2, fps, config: { damping: 200, stiffness: 140 }, durationInFrames: 14 });
    return (
      <div style={fill}>
        {dim}
        {Array.from({ length: 6 }, (_, i) => {
          const size = (380 + i * 120) * s, wave = Math.exp(-Math.pow(((f - click) / fps) * 3.2 - i * 0.45, 2));
          return <div key={i} style={{ position: "absolute", left: cx - size / 2, top: cy - size / 2, width: size, height: size, boxSizing: "border-box", border: `${Math.max(1, 1.5 * s)}px solid #fff`, borderRadius: "50%", opacity: (interpolate(f, [3 + i * 2, 20 + i * 2], [0, 0.22 - i * 0.025], CLAMP) + (f >= click ? wave * 0.35 : 0)) * (1 - leave), transform: `scale(${1 + (f >= click ? wave * 0.04 : 0)})` }} />;
        })}
        <div style={{ position: "absolute", left: cx - 200 * s, top: cy - 200 * s, width: 400 * s, height: 400 * s, boxSizing: "border-box", border: `${3 * s}px solid #fff`, borderRadius: "50%", opacity: f >= click ? (1 - rp) * 0.9 * (1 - leave) : 0, transform: `scale(${0.9 + rp * 2.6})` }} />
        <div style={{ position: "absolute", left: cx - bw / 2, top: cy - bh / 2, width: bw, height: bh, display: "flex", alignItems: "center", justifyContent: "center", gap: 22 * s, borderRadius: 100 * s, backgroundColor: "#fbf6ef", color: "#21170f", fontSize: Math.min(50, (bw / s - 150) / Math.max(1, (text || "Tap here").length * 0.5)) * s, fontWeight: 500, opacity: seen(2), transform: `translateY(${(1 - inn) * 30 * s}px) scale(${(0.9 + 0.1 * inn) * (1 - press * 0.06)})` }}>
          {text || "Tap here"}
          <svg viewBox="0 0 24 24" width={34 * s} height={34 * s} fill="none" stroke="#21170f" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </div>
        <svg viewBox="0 0 24 24" width={70 * s} height={70 * s} style={{ position: "absolute", left: cx + bw / 2 - 120 * s, top: cy + bh / 2 - 40 * s, opacity: Math.min(1, cin * 1.5) * (1 - leave), transform: `translate(${(1 - cin) * 140 * s}px, ${(1 - cin) * 170 * s}px) scale(${1 - press * 0.12})` }}><path d="M5 3l14 8-6 1.5L10 19z" fill="#111" stroke="#fff" strokeWidth={1.6} strokeLinejoin="round" /></svg>
      </div>
    );
  }

  if (fx === "compare") {
    const sides = [text || "Before", scene.label || "After"];
    const second = Math.min(span.durationInFrames - 20, 30);
    const cw = 410 * s, ch = 360 * s, gapX = 76 * s, x0 = (width - cw * 2 - gapX) / 2;
    const lit = interpolate(f, [second + 6, second + 18], [0, 1], CLAMP);
    return (
      <div style={fill}>
        {dim}
        {sides.map((t, i) => {
          const at = i ? second : 3;
          const p = spring({ frame: f - at, fps, config: { damping: 200, stiffness: 130 }, durationInFrames: 15 });
          return (
            <div key={i} style={{ position: "absolute", left: x0 + i * (cw + gapX), top: top0 + 40 * s + i * 60 * s, width: cw, height: ch, boxSizing: "border-box", padding: 40 * s, borderRadius: 40 * s, backgroundColor: i ? "#fbf6ef" : `rgba(244,236,229,${0.86 - 0.3 * lit})`, border: `${Math.max(2, 4 * s)}px solid ${i ? accent : "rgba(255,255,255,0.7)"}`, color: "#21170f", opacity: seen(at), transform: `translate(${(1 - p) * (i ? 160 : -160) * s}px, ${(1 - p) * 50 * s}px) rotate(${i ? 3 : -3}deg) scale(${0.9 + 0.1 * p + (i ? 0.04 * lit : -0.03 * lit)})` }}>
              <div style={{ fontSize: Math.min(54, (cw / s - 80) / Math.max(1, Math.min(t.length, 12) * 0.56)) * s, lineHeight: 1.12, fontWeight: 500, overflowWrap: "anywhere" }}>{t}</div>
              <div style={{ position: "absolute", left: 40 * s, bottom: 40 * s, width: "60%", height: 10 * s, borderRadius: 6 * s, backgroundColor: i ? accent : "rgba(33,23,15,0.14)" }} />
            </div>
          );
        })}
      </div>
    );
  }

  if (fx === "cover") {
    const word = (text || "TODAY").toUpperCase();
    const size = fit(word, width - zone.x * 1.2, 330 * s, 0.82);
    return (
      <div style={fill}>
        <div style={{ position: "absolute", left: 0, top: zone.y * 0.55, width, textAlign: "center", fontFamily: SERIF, fontWeight: 700, fontSize: size, lineHeight: 1, letterSpacing: `${-0.02 * size}px`, color: "#fff", opacity: seen(0), transform: `translateY(${(1 - share) * -60 * s}px)` }}>{word}</div>
        <div style={{ position: "absolute", left: zone.x, top: zone.y * 0.55 + size * 1.04, width: (width - zone.x * 2) * interpolate(f, [6, 20], [0, 1], EASE), height: Math.max(3, 6 * s), backgroundColor: accent, opacity: 1 - leave }} />
        {scene.label && <div style={{ position: "absolute", left: zone.x, top: zone.y * 0.55 + size * 1.04 + 22 * s, fontSize: 38 * s, fontWeight: 800, letterSpacing: `${0.08 * 38 * s}px`, textTransform: "uppercase", color: "#fff", opacity: seen(10) }}>{scene.label}</div>}
      </div>
    );
  }

  if (fx === "glass") {
    const word = (text || "WOW").toUpperCase();
    const size = fit(word, width * 0.92, 400 * s, 0.78);
    return (
      <div style={fill}>
        <div style={{ position: "absolute", left: 0, top: height * 0.16, width, textAlign: "center", fontSize: size, lineHeight: 1, fontWeight: 900, letterSpacing: `${-0.02 * size}px`, color: "rgba(255,255,255,0.2)", WebkitTextStroke: `${Math.max(2, 5 * s)}px rgba(255,255,255,0.92)`, opacity: seen(0), transform: `scale(${0.86 + 0.14 * share})` }}>{word}</div>
      </div>
    );
  }

  if (fx === "graph") {
    const W = width, H = height * 0.42, top = height * 0.1;
    const pts = [[0.04, 0.86], [0.2, 0.78], [0.36, 0.8], [0.52, 0.6], [0.68, 0.5], [0.82, 0.3], [0.94, 0.1]].map(([x, y]) => [x * W, y * H]);
    const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    const drawn = interpolate(f, [4, 30], [0, 1], EASE);
    const tag = pop(28);
    const [px, py] = pts[pts.length - 1];
    return (
      <div style={fill}>
        <div style={{ position: "absolute", left: 0, top, width: W, height: H, opacity: seen(0) }}>
          <div style={{ display: "flex", justifyContent: "space-around", fontSize: 26 * s, fontWeight: 700, letterSpacing: `${0.12 * 26 * s}px`, color: "rgba(255,255,255,0.7)" }}>{["JAN", "FEB", "MAR", "APR", "MAY", "JUN"].map((m) => <span key={m}>{m}</span>)}</div>
          <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
            {[0.25, 0.5, 0.75].map((y) => <line key={y} x1={0} x2={W} y1={y * H} y2={y * H} stroke="rgba(255,255,255,0.16)" strokeWidth={2 * s} />)}
            <path d={`${d} L${px} ${H} L${pts[0][0]} ${H} Z`} fill={accent} fillOpacity={0.22 * drawn} />
            <path d={d} fill="none" stroke={accent} strokeWidth={10 * s} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - drawn} />
            <circle cx={px} cy={py} r={16 * s * tag} fill="#fff" />
          </svg>
          {text && <div style={{ position: "absolute", left: px - 190 * s, top: py - 96 * s, width: 170 * s, textAlign: "center", padding: `${8 * s}px 0`, borderRadius: 14 * s, backgroundColor: accent, color: on, fontSize: 44 * s, fontWeight: 900, opacity: Math.min(1, Math.max(0, (f - 28) / 3)), transform: `scale(${0.5 + 0.5 * tag})` }}>{text.toUpperCase()}</div>}
        </div>
      </div>
    );
  }

  if (fx === "news") {
    const lines = [text, ...(scene.lines ?? [])].filter(Boolean).slice(0, 3);
    const spots = [{ x: 0.05, y: 0.13, r: -4 }, { x: 0.42, y: 0.25, r: 3 }, { x: 0.08, y: 0.4, r: 2 }];
    return (
      <div style={fill}>
        {lines.map((l, i) => {
          const p = pop(i * 7);
          return (
            <div key={i} style={{ position: "absolute", left: spots[i].x * width, top: spots[i].y * height, width: width * 0.52, padding: `${22 * s}px ${26 * s}px`, backgroundColor: "#f6f1e7", color: "#111", borderRadius: 6 * s, opacity: seen(i * 7), transform: `rotate(${spots[i].r}deg) scale(${0.6 + 0.4 * p})` }}>
              <div style={{ fontSize: 20 * s, fontWeight: 800, letterSpacing: `${0.14 * 20 * s}px`, color: "#8a1c1c" }}>BREAKING</div>
              <div style={{ marginTop: 8 * s, fontFamily: SERIF, fontWeight: 700, fontSize: 46 * s, lineHeight: 1.1 }}>{l}</div>
              <div style={{ marginTop: 14 * s, height: 6 * s, width: "82%", backgroundColor: "rgba(17,17,17,0.18)" }} />
              <div style={{ marginTop: 8 * s, height: 6 * s, width: "58%", backgroundColor: "rgba(17,17,17,0.18)" }} />
            </div>
          );
        })}
      </div>
    );
  }

  if (fx === "paper") {
    const zig = (x: number, y: number, w: number, h: number, n: number) => Array.from({ length: n * 2 + 1 }, (_, i) => `${i ? "L" : "M"}${(x + (w * i) / (n * 2)).toFixed(0)} ${(i % 2 ? y : y + h).toFixed(0)}`).join(" ");
    const letters = (text || "").toUpperCase().slice(0, 10).split("");
    const drawn = interpolate(f, [2, 22], [0, 1], EASE);
    return (
      <div style={{ ...fill, backgroundColor: "#efe9dc", opacity: Math.min(1, f / 3) * (1 - leave) }}>
        <svg width={width} height={height} style={{ position: "absolute", left: 0, top: 0 }}>
          {Array.from({ length: 16 }, (_, i) => <line key={i} x1={0} x2={width} y1={(i + 1) * height / 17} y2={(i + 1) * height / 17} stroke="rgba(0,0,0,0.05)" strokeWidth={2} />)}
          <path d={zig(width * 0.08, height * 0.1, width * 0.84, height * 0.2, 14)} fill="none" stroke="#8fa3e8" strokeWidth={14 * s} strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - drawn} />
          <path d={zig(width * 0.5, height * 0.36, width * 0.44, height * 0.16, 9)} fill="none" stroke="#f0c24a" strokeWidth={14 * s} strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - interpolate(f, [8, 26], [0, 1], EASE)} />
          <path d={zig(width * 0.56, height * 0.56, width * 0.36, height * 0.12, 7)} fill="none" stroke="#ef8fa0" strokeWidth={14 * s} strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - interpolate(f, [12, 30], [0, 1], EASE)} />
        </svg>
        <div style={{ position: "absolute", left: zone.x * 0.7, top: zone.y * 0.7, display: "flex", gap: 8 * s }}>
          {letters.map((c, i) => c === " " ? <span key={i} style={{ width: 28 * s }} /> : (
            <span key={i} style={{ display: "block", minWidth: 74 * s, padding: `${4 * s}px ${10 * s}px`, textAlign: "center", fontFamily: i % 2 ? SERIF : fontFamily, fontWeight: 900, fontSize: 84 * s, lineHeight: 1.05, color: i % 3 === 1 ? "#111" : "#fff", backgroundColor: i % 3 === 0 ? "#111" : i % 3 === 1 ? "#fff" : accent, transform: `rotate(${(i % 2 ? 4 : -5)}deg) scale(${0.3 + 0.7 * pop(4 + i * 2)})`, opacity: Math.min(1, Math.max(0, (f - 4 - i * 2) / 2)) }}>{c}</span>
          ))}
        </div>
      </div>
    );
  }

  if (fx === "sketch") {
    // Redrawn every third frame with a small shift, like a line gone over by hand.
    const b = Math.floor(f / 3);
    const j = (n: number) => Math.sin(b * 12.9898 + n * 78.233) * 5 * s;
    const drawn = interpolate(f, [2, 16], [0, 1], EASE);
    const star = (cx: number, cy: number, r: number) => Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5, q = i % 2 ? r * 0.45 : r; return `${i ? "L" : "M"}${(cx + Math.cos(a) * q + j(i)).toFixed(1)} ${(cy + Math.sin(a) * q + j(i + 20)).toFixed(1)}`; }).join(" ") + " Z";
    return (
      <div style={{ ...fill, opacity: 1 - leave }}>
        <svg width={width} height={height} fill="none" stroke="#fff" strokeWidth={7 * s} strokeLinecap="round" strokeLinejoin="round">
          <path d={star(width * 0.82, height * 0.2, 60 * s)} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - drawn} />
          <path d={`M${width * 0.1 + j(1)} ${height * 0.22 + j(2)} q ${40 * s} ${-50 * s} ${90 * s} ${-10 * s} t ${90 * s} ${-10 * s}`} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - interpolate(f, [8, 22], [0, 1], EASE)} />
          <path d={`M${width * 0.12 + j(3)} ${height * 0.62 + j(4)} l ${70 * s} ${-70 * s} m ${-44 * s} ${-4 * s} l ${44 * s} ${4 * s} l ${-4 * s} ${44 * s}`} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - interpolate(f, [14, 28], [0, 1], EASE)} />
        </svg>
      </div>
    );
  }

  if (fx === "frame" || fx === "reveal") {
    const p = pictureFx(fx, share, width, height);
    const k = fx === "frame" ? 1 - 0.2 * share : 1 - 0.3 * share;
    const w = width * k, h = height * k, left = (width - w) / 2, top = (height - h) / 2 + (fx === "frame" ? -0.03 : 0.03) * height * share;
    if (fx === "frame") {
      return (
        <div style={fill}>
          <div style={{ position: "absolute", left: left - 8 * s, top: top - 8 * s, width: w + 16 * s, height: h + 16 * s, boxSizing: "border-box", border: `${8 * s}px solid ${accent}`, borderRadius: (p?.radius ?? 0) + 8 * s, opacity: share }} />
          {text && <div style={{ position: "absolute", left: 0, top: top + h + 26 * s, width, textAlign: "center", fontSize: fit(text, width * 0.9, 58 * s), fontWeight: 800, color: "#fff", opacity: seen(8) }}>{text}</div>}
        </div>
      );
    }
    const bar = 86 * s;
    return (
      <div style={fill}>
        <div style={{ position: "absolute", left, top: top - bar, width: w, height: bar + (p?.radius ?? 0), boxSizing: "border-box", padding: `0 ${26 * s}px ${p?.radius ?? 0}px`, display: "flex", alignItems: "center", gap: 12 * s, backgroundColor: "#f1efe9", borderRadius: `${22 * s}px ${22 * s}px 0 0`, opacity: Math.min(1, share * 2) }}>
          {["#ee6a5f", "#f5bd4f", "#61c454"].map((c) => <span key={c} style={{ width: 20 * s, height: 20 * s, borderRadius: 99, backgroundColor: c }} />)}
          <span style={{ marginLeft: 14 * s, fontSize: 30 * s, fontWeight: 700, color: "#222" }}>{text || "Now playing"}</span>
        </div>
      </div>
    );
  }

  if (fx === "phone") {
    const lines = (scene.lines ?? []).slice(0, 3);
    const pw = width * 0.38, ph = pw * 1.9;
    const inn = spring({ frame: f, fps, config: { damping: 14, stiffness: 120 }, durationInFrames: 18 });
    return (
      <div style={fill}>
        <div style={{ position: "absolute", left: zone.x * 0.6, top: height * 0.08, width: pw, height: ph, boxSizing: "border-box", padding: `${50 * s}px ${24 * s}px ${24 * s}px`, borderRadius: 54 * s, backgroundColor: INK, border: `${8 * s}px solid #2a2c33`, color: "#fff", opacity: seen(0), transform: `translateX(${(1 - inn) * -pw * 1.2}px) rotate(${-4 + 4 * (1 - inn)}deg)` }}>
          <div style={{ position: "absolute", left: "50%", top: 16 * s, width: 110 * s, height: 22 * s, marginLeft: -55 * s, borderRadius: 99, backgroundColor: "#2a2c33" }} />
          <div style={{ fontSize: 36 * s, lineHeight: 1.15, fontWeight: 800 }}>{text || "Notes"}</div>
          <div style={{ marginTop: 14 * s, height: 5 * s, width: `${interpolate(f, [8, 20], [0, 60], EASE)}%`, borderRadius: 99, backgroundColor: accent }} />
          {lines.map((l, i) => (
            <div key={i} style={{ marginTop: 20 * s, padding: `${14 * s}px ${16 * s}px`, borderRadius: 16 * s, backgroundColor: "rgba(255,255,255,0.08)", fontSize: 26 * s, lineHeight: 1.2, fontWeight: 600, opacity: interpolate(f, [12 + i * 6, 18 + i * 6], [0, 1], CLAMP), transform: `translateY(${interpolate(f, [12 + i * 6, 18 + i * 6], [14, 0], EASE) * s}px)` }}>{l}</div>
          ))}
        </div>
      </div>
    );
  }

  // dolly: the move is the person's (ClipComposition); nothing is drawn here.
  return null;
}
