"use client";

// A graphic scene (lib/studioClips/scenes.ts): a designed card over the top of
// the picture that comes on with the words it shows.
//   stat   the figure counts up to the number that was said and lands big in
//          the cut's accent, a rule draws out from the middle, and what it
//          counts sits under it in spaced capitals;
//   change the figure it was lands first and is struck out, an arrow draws,
//          and the figure it became pops in the accent;
//   steps  a checklist: each row slides in as its line is said, its number
//          fills with the accent, and a track down the side fills to the row
//          being said;
//   picture what is being talked about, drawn: a country's outline that draws
//          itself, fills and gets a pin, or a flat drawing of a thing whose
//          shapes draw on one after another (lib/studioClips/sceneArt.ts),
//          with a headline under it;
//   line   the sentence arrives word by word, then the word that carries it is
//          boxed in the accent.
// A card can carry a small icon for what it is about (lib/studioClips/sceneIcons.ts),
// popped in an accent disc above the figure or the line.
// An accent bar draws down the card's edge as it lands; it leaves by lifting
// away. As a split screen the card is a panel across the top of the frame
// instead, and the picture moves down under it (ClipComposition's PictureShift
// reads splitShare to move in step). Driven by the frame only, in the plain styles the lower third and the
// ranking use (no filters, no gradients), so the Player, a scrub and the
// browser export draw the same frame.
import React from "react";
import { Easing, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { readableOn, safeZoneFor } from "@/lib/textPresets";
import type { SceneSpan } from "@/lib/studioClips/scenes";
import { SCENE_ICONS, type IconShape, type SceneIconId } from "@/lib/studioClips/sceneIcons";
import type { ArtMove, ArtTone, SceneArt } from "@/lib/studioClips/sceneArt";
import { skinOf, type SplitSkinId } from "@/lib/studioClips/splitSkins";

const OUT_FRAMES = 7;
const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const EASE = { ...CLAMP, easing: Easing.out(Easing.cubic) } as const;
const CARD = "rgba(9,10,13,0.88)";
const EDGE = "rgba(255,255,255,0.14)";
const POINT = /^(free|save|secret|never|nobody|stop|mistake|best|worst|why|truth|wrong|only|every|always|without|nothing|everything|biggest|fastest|easiest)$/i;
const SMALL = /^(a|an|the|and|or|but|so|to|of|in|on|at|is|it|its|that|this|we|i|you|they|he|she|for|with|as|by|be|are|was|were|way|does|do)$/i;

/** Split screen: the share of the frame's height the panel takes, and how far the picture moves down under it. */
const PANEL = "#0b0c10";
/** Split screen: how far in the panel is at a frame of its scene, 0 (away) to 1 (down). The picture moves by the same share. */
export function splitShare(f: number, frames: number, fps: number): number {
  const land = spring({ frame: f, fps, config: { damping: 200, stiffness: 170 }, durationInFrames: 14 });
  const leave = interpolate(f, [frames - OUT_FRAMES - 2, frames], [0, 1], { ...CLAMP, easing: Easing.in(Easing.cubic) });
  return Math.max(0, Math.min(1, land) * (1 - leave));
}

/** The card's icon: a line drawing on an accent disc that pops in just after the card lands. */
function SceneIcon({ id, size, accent, on, at = 4, style }: { id: SceneIconId; size: number; accent: string; on: string; at?: number; style?: React.CSSProperties }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: f - at, fps, config: { damping: 11, stiffness: 190 }, durationInFrames: 14 });
  const shapes: readonly IconShape[] = SCENE_ICONS[id].shapes;
  return (
    <div style={{ flex: "none", width: size, height: size, borderRadius: size, backgroundColor: accent, display: "flex", alignItems: "center", justifyContent: "center", opacity: Math.min(1, Math.max(0, (f - at) / 3)), transform: `scale(${0.4 + 0.6 * pop})`, ...style }}>
      <svg viewBox="0 0 24 24" width={size * 0.56} height={size * 0.56} fill="none" stroke={on} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        {shapes.map((sh, i) => ("d" in sh ? <path key={i} d={sh.d} /> : "c" in sh ? <circle key={i} cx={sh.c[0]} cy={sh.c[1]} r={sh.c[2]} /> : "r" in sh ? <rect key={i} x={sh.r[0]} y={sh.r[1]} width={sh.r[2]} height={sh.r[3]} rx={sh.r[4]} /> : <polygon key={i} points={sh.p} />))}
      </svg>
    </div>
  );
}

/** How a drawing behaves once it is on (lib/studioClips/sceneArt.ts ArtMove): the thing acts out what is said. Nothing before it has drawn. */
function acting(move: ArtMove | undefined, since: number, fps: number): React.CSSProperties {
  if (!move || since <= 0) return {};
  const t = since / fps, ease = Math.min(1, t / 0.4);
  if (move === "spin") return { transform: `rotate(${t * 200 * ease}deg)`, transformOrigin: "50% 50%" };
  if (move === "bounce") return { transform: `translateY(${-Math.abs(Math.sin(t * Math.PI * 2.2)) * 14 * ease}%)` };
  if (move === "float") return { transform: `translate(${Math.sin(t * 1.6) * 3 * ease}%, ${Math.sin(t * 2.3) * 5 * ease}%)` };
  if (move === "pulse") return { transform: `scale(${1 + 0.09 * Math.max(0, Math.sin(t * Math.PI * 3)) * ease})`, transformOrigin: "50% 50%" };
  if (move === "drive") return { transform: `translateX(${Math.sin(t * 1.5) * 9 * ease}%) rotate(${Math.sin(t * 9) * 1.2}deg)`, transformOrigin: "50% 90%" };
  // fill: the thing rises into view from its base, as a level does.
  return { clipPath: `inset(${Math.max(0, 100 - t * 70)}% 0 0 0)` };
}

/** One drawing of a picture scene, on its 100 by 100 grid: the outline draws on, the fill comes in behind it, a map gets its pin. */
function ArtPiece({ art, size, accent, at, s, ink = "#fff", ground = PANEL }: { art: SceneArt; size: number; accent: string; at: number; s: number; /** the look's ink and ground, on a light split screen */ ink?: string; ground?: string }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tone = (t: ArtTone) => (t === "accent" ? accent : t === "light" ? ink : t === "mid" ? (ink === "#fff" ? "rgba(255,255,255,0.4)" : "rgba(60,60,66,0.4)") : t === "dark" ? ground : "none");
  const pop = spring({ frame: f - at, fps, config: { damping: 14, stiffness: 150 }, durationInFrames: 16 });
  const draw = (from: number, len: number) => 1 - interpolate(f, [from, from + len], [0, 1], EASE);
  const fade = (from: number, len: number) => interpolate(f, [from, from + len], [0, 1], CLAMP);
  const pin = spring({ frame: f - at - 20, fps, config: { damping: 9, stiffness: 180 }, durationInFrames: 16 });
  const ring = interpolate(f, [at + 24, at + 44], [0, 1], CLAMP);
  return (
    <div style={{ flex: "none", width: size, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 * s, opacity: Math.min(1, Math.max(0, (f - at) / 3)), transform: `scale(${0.82 + 0.18 * pop})` }}>
      {art.kind === "page" ? (
        // A real page in a browser window: its bar with the site's name, the page under it drifting up slowly, as if read.
        <div style={{ width: size, borderRadius: size * 0.045, overflow: "hidden", backgroundColor: "#fff", border: `${Math.max(1, 2 * s)}px solid rgba(0,0,0,0.12)` }}>
          <div style={{ height: size * 0.085, padding: `0 ${size * 0.035}px`, display: "flex", alignItems: "center", gap: size * 0.016, backgroundColor: "#f1efe9" }}>
            {["#ee6a5f", "#f5bd4f", "#61c454"].map((c) => <span key={c} style={{ width: size * 0.024, height: size * 0.024, borderRadius: 99, backgroundColor: c }} />)}
            <span style={{ marginLeft: size * 0.03, flex: 1, height: size * 0.05, padding: `0 ${size * 0.03}px`, display: "flex", alignItems: "center", borderRadius: 99, backgroundColor: "#fff", color: "#333", fontSize: size * 0.032, fontWeight: 600 }}>{art.name}</span>
          </div>
          <div style={{ height: size * 0.62, overflow: "hidden" }}>
            <Img src={art.src} style={{ display: "block", width: "100%", transform: `translateY(${-interpolate(f, [at + 10, at + 110], [0, 14], CLAMP)}%)` }} />
          </div>
        </div>
      ) : art.kind === "logo" ? (
        // A company's own mark, on a white tile so any mark reads on any ground.
        <div style={{ width: size * 0.86, height: size * 0.86, margin: size * 0.07, boxSizing: "border-box", padding: size * 0.14, borderRadius: size * 0.2, backgroundColor: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Img src={art.src} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        </div>
      ) : (
      <svg viewBox="0 0 100 100" width={size} height={size} style={{ overflow: "visible", ...(art.kind === "draw" ? acting(art.move, f - at - 16, fps) : {}) }}>
        {art.kind === "map" ? (
          <>
            <path d={art.d} fill={accent} fillOpacity={0.9 * fade(at + 10, 10)} stroke={ink} strokeWidth={1.6} strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={draw(at, 18)} />
            <circle cx={art.c[0]} cy={art.c[1]} r={3 + 9 * ring} fill="none" stroke={ink} strokeWidth={1.4} opacity={(1 - ring) * (f >= at + 24 ? 1 : 0)} />
            <circle cx={art.c[0]} cy={art.c[1] - (1 - Math.min(1, pin)) * 26} r={3.6} fill={ink} stroke={ground} strokeWidth={1.4} opacity={Math.min(1, Math.max(0, (f - at - 20) / 2))} />
          </>
        ) : art.kind !== "draw" ? null : art.shapes.map((sh, i) => {
          const from = at + 2 + i * 2;
          return <path key={i} d={sh.d} fill={tone(sh.fill)} fillOpacity={sh.fill === "none" ? 0 : fade(sh.stroke === "none" ? from : from + 6, 8)} stroke={tone(sh.stroke)} strokeWidth={sh.w ?? 3} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={sh.stroke === "none" ? 0 : draw(from, 12)} />;
        })}
      </svg>
      )}
      {art.name && art.kind !== "page" && <div style={{ fontSize: 30 * s, lineHeight: 1.1, fontWeight: 800, letterSpacing: `${0.08 * 30 * s}px`, textTransform: "uppercase", color: ink, textAlign: "center", opacity: fade(at + 12, 8) }}>{art.name}</div>}
    </div>
  );
}

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

export function SceneLayer({ span, fontFamily, accent: cutAccent, low, split, skin: skinId }: {
  span: SceneSpan; fontFamily: string;
  /** the cut's accent: the figure, the bar, the row numbers, the boxed word */
  accent: string;
  /** captions sit at the top of this cut, so the card sits lower */
  low?: boolean;
  /** split screen: a panel across the top of the frame, the picture moved down under it */
  split?: boolean;
  /** split screen: the look the panel wears (lib/studioClips/splitSkins.ts) */
  skin?: SplitSkinId;
}) {
  const skin = skinOf(split ? skinId : undefined);
  const accent = (split && skin.accent) || cutAccent;
  const ink = split ? skin.ink : "#fff";
  const light = ink !== "#ffffff" && ink !== "#fff" && ink !== "#fefefe" && ink !== "#edeef1";
  const soft = (a: number) => (light ? `rgba(33,33,38,${a})` : `rgba(255,255,255,${a})`);
  const f = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const zone = safeZoneFor(width, height);
  const { scene } = span;
  // A split-screen panel has the whole top of the frame to itself, so its type is set larger than a card's.
  const s = (Math.min(width, height) / 1080) * (split ? (scene.kind === "steps" ? 1.2 : 1.25) : 1);
  const land = spring({ frame: f, fps, config: { damping: 15, stiffness: 160 }, durationInFrames: 14 });
  const leave = interpolate(f, [span.durationInFrames - OUT_FRAMES, span.durationInFrames], [0, 1], CLAMP);
  const on = readableOn(accent);
  const share = split ? splitShare(f, span.durationInFrames, fps) : 0;
  const card: React.CSSProperties = split ? {
    // A panel of its own across the top; it slides down as the picture moves under it.
    position: "absolute", left: 0, top: 0, width, height: Math.round(height * skin.panel), boxSizing: "border-box",
    padding: `${zone.y * 0.55}px ${zone.x + 24 * s}px ${30 * s}px`, display: "flex", flexDirection: "column", justifyContent: "center",
    backgroundColor: skin.bg, ...(skin.seam ? { borderBottom: `${Math.max(4, Math.round(12 * s))}px solid ${accent}` } : {}), color: ink, fontFamily, overflow: "hidden",
    transform: `translateY(${-(1 - share) * 100}%)`,
  } : {
    // Centred in the frame: the top of the picture is clear of the apps' buttons, which sit lower on the right.
    position: "absolute", left: zone.x, top: scene.place === "lower" ? Math.round(height * 0.5) : zone.y + ((scene.place ? scene.place === "upper" : low) ? zone.height * 0.3 : 0), width: width - zone.x * 2, boxSizing: "border-box",
    padding: `${40 * s}px ${44 * s}px ${40 * s}px ${58 * s}px`, borderRadius: 34 * s, backgroundColor: CARD, border: `${Math.max(1, Math.round(2 * s))}px solid ${EDGE}`,
    color: "#fff", fontFamily, overflow: "hidden",
    opacity: Math.min(1, f / 3) * (1 - leave), transform: `translateY(${((1 - land) * -36 - leave * 24) * s}px) scale(${0.96 + 0.04 * land})`,
  };
  // The accent bar down the card's left edge, drawn as the card lands.
  // On a split screen the field's own pattern takes the bar's place: a dot field (Ember Brief) or a fine lattice (Night Class).
  const pattern = split && skin.grid !== "none" ? (
    <svg width={width} height={Math.round(height * skin.panel)} style={{ position: "absolute", left: 0, top: 0, zIndex: -1 }}>
      <defs>
        <pattern id={`sk-${scene.id}`} width={skin.grid === "dots" ? 26 * s : 16 * s} height={skin.grid === "dots" ? 26 * s : 18 * s} patternUnits="userSpaceOnUse">
          {skin.grid === "dots" ? <circle cx={13 * s} cy={13 * s} r={2.2 * s} fill={skin.gridColor} /> : <path d={`M0 0H${16 * s}M0 0V${18 * s}`} stroke={skin.gridColor} strokeWidth={Math.max(1, s)} fill="none" />}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#sk-${scene.id})`} />
    </svg>
  ) : null;
  const bar = split ? pattern : <div style={{ position: "absolute", left: 0, top: 0, width: 14 * s, height: `${interpolate(f, [2, 14], [0, 100], EASE)}%`, backgroundColor: accent }} />;

  // The icon over a figure, centred.
  const icon = scene.icon && scene.kind !== "steps" ? <SceneIcon id={scene.icon} size={112 * s} accent={accent} on={on} style={{ margin: `0 auto ${22 * s}px` }} /> : null;

  if (scene.kind === "stat") {
    const size = scene.text.length <= 4 ? 236 : scene.text.length <= 7 ? 172 : 124;
    const counted = interpolate(f, [2, 18], [0, 1], EASE);
    return (
      <div style={{ ...card, textAlign: "center" }}>
        {bar}
        {icon}
        <div style={{ fontSize: size * s, lineHeight: 1, fontWeight: 800, letterSpacing: `${-0.03 * size * s}px`, color: accent, transform: `scale(${0.8 + 0.2 * land})` }}>{countTo(scene.text, counted)}</div>
        <div style={{ margin: `${22 * s}px auto 0`, height: Math.max(3, Math.round(6 * s)), width: `${interpolate(f, [8, 22], [0, 46], EASE)}%`, borderRadius: 999, backgroundColor: ink, opacity: 0.9 }} />
        {scene.label && <div style={{ marginTop: 22 * s, fontSize: 50 * s, lineHeight: 1.15, fontWeight: 800, textTransform: "uppercase", letterSpacing: `${0.05 * 50 * s}px`, opacity: interpolate(f, [10, 18], [0, 1], CLAMP), transform: `translateY(${interpolate(f, [10, 18], [14, 0], EASE) * s}px)` }}>{scene.label}</div>}
      </div>
    );
  }

  if (scene.kind === "change") {
    const was = scene.was ?? "";
    const longest = Math.max(was.length, scene.text.length);
    const size = longest <= 3 ? 190 : longest <= 5 ? 150 : 110;
    const strike = interpolate(f, [12, 22], [0, 100], EASE);
    const arrow = interpolate(f, [18, 28], [0, 1], EASE);
    const pop = spring({ frame: f - 24, fps, config: { damping: 11, stiffness: 190 }, durationInFrames: 14 });
    return (
      <div style={{ ...card, textAlign: "center" }}>
        {bar}
        {icon}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 30 * s }}>
          <span style={{ position: "relative", fontSize: size * 0.72 * s, lineHeight: 1, fontWeight: 800, color: ink }}>
            <span style={{ opacity: 0.45 + 0.55 * (1 - strike / 100) }}>{was}</span>
            <span style={{ position: "absolute", left: "-6%", top: "50%", height: Math.max(4, Math.round(10 * s)), width: `${strike * 1.12}%`, borderRadius: 999, backgroundColor: accent }} />
          </span>
          <span style={{ width: 90 * s, height: Math.max(4, Math.round(8 * s)), borderRadius: 999, backgroundColor: soft(0.9), transform: `scaleX(${arrow})`, transformOrigin: "left center" }} />
          <span style={{ fontSize: size * s, lineHeight: 1, fontWeight: 800, letterSpacing: `${-0.03 * size * s}px`, color: accent, opacity: Math.min(1, Math.max(0, (f - 24) / 3)), transform: `scale(${0.5 + 0.5 * pop})` }}>{scene.text}</span>
        </div>
        {scene.label && <div style={{ marginTop: 26 * s, fontSize: 48 * s, lineHeight: 1.15, fontWeight: 800, textTransform: "uppercase", letterSpacing: `${0.05 * 48 * s}px`, opacity: interpolate(f, [26, 34], [0, 1], CLAMP) }}>{scene.label}</div>}
      </div>
    );
  }

  // (children of the panel are positioned, so they paint above its pattern)
  if (scene.kind === "picture") {
    const arts = scene.art ?? [];
    const paged = arts.some((a) => a.kind === "page");
    const size = (paged ? 860 / (split ? 1.25 : 1) : arts.length <= 1 ? 330 : arts.length === 2 ? 270 : 210) * s;
    const after = 10 + arts.length * 9;
    const parts = scene.text.split(" ").filter(Boolean);
    const big = scene.text.length <= 18 ? 84 : scene.text.length <= 32 ? 66 : 54;
    return (
      <div style={{ ...card, textAlign: "center" }}>
        {bar}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", gap: 40 * s }}>
          {arts.map((a, i) => <ArtPiece key={i} art={a} size={size} accent={accent} at={3 + i * 9} s={s} ink={ink} ground={split ? skin.bg : PANEL} />)}
        </div>
        {parts.length > 0 && (
          <div style={{ marginTop: 26 * s, display: "flex", flexWrap: "wrap", justifyContent: "center", columnGap: 16 * s, rowGap: 6 * s, fontSize: big * s, lineHeight: 1.12, fontWeight: 800, letterSpacing: `${-0.01 * big * s}px` }}>
            {parts.map((w, i) => { const p = interpolate(f, [after + i * 3, after + i * 3 + 6], [0, 1], EASE); return <span key={i} style={{ opacity: p, transform: `translateY(${(1 - p) * 18 * s}px)` }}>{w}</span>; })}
          </div>
        )}
        {scene.label && <div style={{ marginTop: 14 * s, fontSize: 40 * s, lineHeight: 1.15, fontWeight: 800, textTransform: "uppercase", letterSpacing: `${0.05 * 40 * s}px`, color: accent, opacity: interpolate(f, [after + 8, after + 16], [0, 1], CLAMP) }}>{scene.label}</div>}
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
        {span.rows.length > 1 && !split && (
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
      {scene.icon && <SceneIcon id={scene.icon} size={104 * s} accent={accent} on={on} style={{ margin: split ? `0 auto ${24 * s}px` : `0 0 ${24 * s}px` }} />}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: split ? "center" : undefined, columnGap: 18 * s, rowGap: 10 * s, fontSize: size * s, lineHeight: 1.16, fontWeight: 800, letterSpacing: `${-0.01 * size * s}px` }}>
        {parts.map((w, i) => {
          const p = interpolate(f, [i * 3, i * 3 + 6], [0, 1], EASE);
          const style: React.CSSProperties = { position: "relative", opacity: p, transform: `translateY(${(1 - p) * 22 * s}px)` };
          if (i !== key) return <span key={i} style={style}>{w}</span>;
          return (
            <span key={i} style={{ ...style, padding: `0 ${12 * s}px`, margin: `0 ${-12 * s}px`, color: box > 0.5 ? on : ink }}>
              <span style={{ position: "absolute", left: 0, top: "6%", height: "88%", width: `${box * 100}%`, borderRadius: 12 * s, backgroundColor: accent }} />
              <span style={{ position: "relative" }}>{w}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
