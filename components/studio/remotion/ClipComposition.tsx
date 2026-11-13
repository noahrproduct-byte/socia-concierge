"use client";

// The post as video: the EDL rendered by Remotion, identical in the Player
// (preview) and in the browser render (export). Nothing here is invented at
// render time — segments, text lines, measured gain and transcript captions
// all come from the validated EDL. Text lines are PNGs from the one text
// renderer (lib/textRender.ts), so the preview, the export and the Rate
// preview share every pixel of them. Styles stay inside the client-side
// renderer's supported subset (no CSS filters, no backdrop effects); picture
// corrections use @remotion/effects' colorCorrection(), a WebGL pass that
// the Player, the browser render and Safari all support.
import React, { useEffect, useMemo, useState } from "react";
import { AbsoluteFill, Img, Sequence, Video as Html5Video, continueRender, delayRender, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio, Video } from "@remotion/media";
import { createContext, useContext } from "react";
import { colorCorrection } from "@remotion/effects/color-correction";
import { zoomBlur } from "@remotion/effects/zoom-blur";
import { blur } from "@remotion/effects/blur";
import { vignette } from "@remotion/effects/vignette";
import { noise } from "@remotion/effects/noise";
import { chromaticAberration } from "@remotion/effects/chromatic-aberration";
import { scanlines } from "@remotion/effects/scanlines";
import { clipSecAt, motionAt, speedPieces, transformCss } from "@/lib/studioClips/motion";
import { letterboxPx, lookCssFilter, lookPlan, type LookStep } from "@/lib/studioClips/look";
import { resolveTheme } from "@/lib/studioClips/themes/apply";
import type { Theme } from "@/lib/studioClips/themes/schema";
import { DEFAULT_STYLE, captionLayout, captionStyle, type EdlStyle, type FontId } from "@/lib/studioClips/style";
import { presetOf, safeZoneFor } from "@/lib/textPresets";
import { renderTextLayer } from "@/lib/textRender";
import { familyOf, loadEditorFont } from "@/lib/editorFonts";
import type { TikTokPage } from "@remotion/captions";
import type { CaptionAnimation } from "@/lib/studioClips/style";
import { rankingBox, type RankingOverlay } from "@/lib/clipper/ranking";
import { emphasisIndex } from "@/lib/clipper/emphasis";
import { RankingLayer } from "./RankingLayer";
import type { BuildSource, Edl, EdlText, EndCard } from "@/lib/studioClips/types";
import { END_CARD_SEC, endLineSize } from "@/lib/studioClips/teach";
import { viewAt, viewBox } from "@/lib/clipper/reframe";
import type { SegmentFrame } from "@/lib/studioClips/types";
import { timeline, captionPages, clearOfText, dbToGain, edgeEnvelope, secToFrames, underVoice, voiceTailEnvelope, videoBox, EDGE_FADE_FRAMES, FPS, type TimelineSegment } from "@/lib/studioClips/timeline";
import { duckLevel, speechSpans } from "@/lib/studioClips/musicDuck";
import { UNDER_VOICEOVER, voiceSpans } from "@/lib/studioClips/voiceover";
import { transitionLook, transitionSound } from "@/lib/studioClips/transitions";
import { punchScaleAt } from "@/lib/studioClips/punch";
import type { TransitionKind } from "@/lib/studioClips/types";
import { gainAtDb } from "@/lib/studioClips/sound";
import { SPEECH_CUT_DB } from "@/lib/studioClips/edl";

// Faces come from the site's own files (lib/editorFonts.ts); a face is registered the first time a cut asks for it.
const familyFor = (id: FontId): string => { void loadEditorFont(id); return familyOf(id); };

export type ClipCompositionProps = {
  edl: Edl;
  sources: Record<string, BuildSource>;
  captionsOn: boolean;
  /** the AI Clipper's countdown: its title and numbered list over the picture */
  ranking?: RankingOverlay;
  /** the most words a caption line shows at once (the AI Clipper). Absent = as many as fit the page's time. */
  captionWords?: number;
  /** the AI Clipper's marked words: one word per caption line takes the colour. Absent = no colouring. */
  emphasis?: string[];
  /** false shows the cut without the measured corrections (Before); omitted = After */
  finishOn?: boolean;
  /** a playable link to the cut's soundtrack (edl.soundtrack), when it has one */
  musicUrl?: string | null;
  /** playable links to the voiceover's voiced lines, by storage path (edl.voiceover) */
  voiceUrls?: Record<string, string>;
  /** each clip's sound with the background noise reduced (lib/studioClips/cleanSound.ts), played instead of its own when edl.cleanSound is on */
  cleanAudio?: Record<string, string>;
  /** draw the text safe zone over the picture (preview check only; the export never sets it) */
  safeZoneGuide?: boolean;
  /** the brand mark for a theme with a watermark slot; absent = the slot stays empty */
  watermarkUrl?: string | null;
  /**
   * The Player is showing the cut (renderProps.ts previewProps). Shots are then drawn with the browser's
   * own video element, which loads and seeks each shot during its premount, so a cut never shows black
   * while the next shot decodes (bug 37). The export keeps @remotion/media's frame-accurate decoder.
   */
  preview?: boolean;
};

/** Whether this composition is the Player's preview (see ClipCompositionProps.preview). */
const PreviewCtx = createContext(false);

/** The soundtrack fades in over 0.2 s and out over the last 0.8 s, so it never starts or stops abruptly. */
const MUSIC_FADE_IN = 6, MUSIC_FADE_OUT = 24;

/** The ending: the frame softens behind big type in the middle (lib/studioClips/teach.ts). */
const END_FRAMES = Math.round(END_CARD_SEC * FPS);
const END_SOFTEN_FRAMES = 9;

/** The cut sound (public/editor-sfx, made with ffmpeg: filtered noise, no recording): half a second, led in by six frames. */
const SFX_WHOOSH = "/editor-sfx/whoosh.m4a";
const SFX_FRAMES = 15, SFX_LEAD_FRAMES = 6, SFX_LEVEL = 0.5;
const SFX_POP = "/editor-sfx/pop.m4a";
const POP_FRAMES = 8, POP_LEVEL = 0.5;

/** How long before a shot appears the Player starts loading it. */
const PREMOUNT_FRAMES = 45;

/** Heavier type for the outline look: a thin weight disappears inside its outline. */
const outlineWeight = (font: EdlStyle["font"]) => (font === "anton" || font === "bebas" ? 400 : 800);

/**
 * One line of text: the preset, the words and the frame size go through the
 * one renderer (lib/textRender.ts) and come back as a PNG the size of the
 * frame; the Player and the browser export draw that same image. The render
 * waits for the fonts, and delayRender() holds the frame until it is ready,
 * so neither path ever paints a fallback face. Only the way in and out is
 * animated here: a fade or a small pop, as the preset says.
 */
function TextLayer({ line, width, height, font, textBox, accent, animation }: { line: EdlText; width: number; height: number; font: FontId; textBox: EdlStyle["textBox"]; accent: string; /** the theme's entrance; absent = the look's own */ animation?: "pop" | "rise" | "wipe" | "settle" | "letters" }) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const preset = presetOf(line);
  const args = useMemo(() => ({ presetId: preset.id, text: line.text, slot: line.slot, width, height, font, textBox, accent }), [preset.id, line.text, line.slot, width, height, font, textBox, accent]);
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const handle = delayRender(`text ${line.id}`, { timeoutInMilliseconds: 60_000 });
    renderTextLayer(args)
      .then((r) => { if (r.layout.fits) lastLayouts.set(line.id, { width: args.width, box: r.layout.box }); if (alive) setSrc(r.layout.fits ? r.url : null); })
      .catch(() => { if (alive) setSrc(null); })
      .finally(() => continueRender(handle));
    return () => { alive = false; };
  }, [args, line.id]);
  // The Showroom theme's lines are live type, not an image: letters rise in one by one under a gold rule.
  if (animation === "letters") return <KineticLine text={line.text} slot={line.slot ?? preset.slot} family={familyFor(font)} accent={accent} width={width} height={height} />;
  if (!src) return null;
  const inF = Math.max(1, Math.round(fps * 0.25)), outF = Math.max(1, Math.round(fps * 0.25));
  const leave = interpolate(frame, [durationInFrames - outF, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeIn = interpolate(frame, [0, inF], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const out3 = interpolate(frame, [durationInFrames - 3, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // A theme's entrance (lib/studioClips/themes): a spring pop, a rise from below, a wipe from the left; "settle" is the clean look below.
  if (animation && animation !== "settle") {
    const k = spring({ frame, fps, config: { damping: animation === "pop" ? 12 : 18, stiffness: animation === "pop" ? 240 : 180, mass: 0.7 }, durationInFrames: 12 });
    const style: React.CSSProperties =
      animation === "pop" ? { opacity: Math.min(1, frame / 2, out3), transform: `scale(${interpolate(k, [0, 1], [0.7, 1])})` }
      : animation === "rise" ? { opacity: Math.min(1, frame / 3, out3), transform: `translateY(${interpolate(k, [0, 1], [3, 0])}%)` }
      : { opacity: Math.min(1, out3) };
    const box = layout(line, width, height);
    return (
      <AbsoluteFill style={style}>
        {animation === "wipe" ? (
          // The wipe: a window the width of the line's box that opens from its left edge; the image behind it never moves.
          <div style={{ position: "absolute", left: box.x, top: box.y, width: box.width * interpolate(k, [0, 1], [0, 1]), height: box.height, overflow: "hidden" }}>
            <Img src={src} style={{ position: "absolute", left: -box.x, top: -box.y, width, height }} pauseWhenLoading />
          </div>
        ) : <Img src={src} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} pauseWhenLoading />}
      </AbsoluteFill>
    );
  }
  if (textBox !== "outline") {
    // The clean look: the line arrives a little big and soft and settles sharp in WORD_SETTLE_FRAMES, then drifts
    // up very slowly while it is on screen, so it is never static (Noah's picks, 2026-11-12).
    const k = interpolate(frame, [0, WORD_SETTLE_FRAMES], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const ease = 1 - (1 - k) * (1 - k);
    const drift = interpolate(frame, [0, durationInFrames], [0, -0.6], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    return (
      <AbsoluteFill style={{ opacity: Math.min(ease, out3), transform: `translateY(${drift + (1 - ease) * 1.2}%) scale(${1 + (1 - ease) * 0.08})`, filter: ease < 1 ? `blur(${(1 - ease) * 8}px)` : undefined }}>
        <Img src={src} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} pauseWhenLoading />
      </AbsoluteFill>
    );
  }
  const pop = preset.animation === "pop" ? interpolate(frame, [0, 5, 9], [0.9, 1.04, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
  const appear = preset.animation === "pop" ? interpolate(frame, [0, 3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : fadeIn;
  return (
    <AbsoluteFill style={{ opacity: Math.min(appear, leave), transform: pop !== 1 ? `scale(${pop})` : undefined }}>
      <Img src={src} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} pauseWhenLoading />
    </AbsoluteFill>
  );
}

/**
 * A line of live type (the Showroom theme, from the hand-cut rug reels): the letters rise out of a
 * clipping mask one after another on a spring, then a gold rule draws under them; out is a short
 * rise and fade. Sits in the line's slot of the safe zone, in a dark pill. Everything is frame-driven.
 */
function KineticLine({ text, slot, family, accent, width, height }: { text: string; slot: "top" | "middle" | "bottom"; family: string; accent: string; width: number; height: number }) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const letters = lines.join(" ").length;
  const out = interpolate(frame, [durationInFrames - 6, durationInFrames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ruleAt = letters * 1.2 + 4;
  const rule = interpolate(frame, [ruleAt, ruleAt + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const z = safeZoneFor(width, height);
  const top = slot === "top" ? z.y + z.height * 0.06 : slot === "middle" ? z.y + z.height * 0.42 : z.y + z.height * 0.74;
  const size = Math.round((lines.some((l) => l.length > 16) ? 64 : 78) * (width / 1080));
  let n = 0;
  return (
    <AbsoluteFill style={{ opacity: 1 - out, transform: `translateY(${-out * 40}px)` }}>
      <div style={{ position: "absolute", top, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ overflow: "hidden", padding: `${Math.round(10 * width / 1080)}px ${Math.round(36 * width / 1080)}px ${Math.round(4 * width / 1080)}px`, borderRadius: Math.round(24 * width / 1080), backgroundColor: "rgba(10,8,6,0.55)", display: "flex", flexDirection: "column", alignItems: "center", maxWidth: "92%" }}>
          {lines.map((l, li) => (
            <div key={li} style={{ overflow: "hidden", display: "flex", lineHeight: 1.1, paddingBottom: Math.round(6 * width / 1080), fontFamily: family, fontWeight: 800, fontSize: size, letterSpacing: 1, color: "#fff", textShadow: "0 3px 10px rgba(0,0,0,0.6)", whiteSpace: "pre" }}>
              {l.split("").map((ch, i) => {
                const k = spring({ frame: frame - n++ * 1.2, fps, config: { damping: 14, stiffness: 190, mass: 0.7 }, durationInFrames: 16 });
                return <span key={i} style={{ display: "inline-block", transform: `translateY(${(1 - k) * 110}%)` }}>{ch}</span>;
              })}
            </div>
          ))}
          <div style={{ height: Math.round(6 * width / 1080), width: `${rule * 100}%`, backgroundImage: `linear-gradient(90deg, ${lighten(accent)} 0%, ${accent} 50%, ${darken(accent)} 100%)`, borderRadius: 3, marginBottom: Math.round(10 * width / 1080) }} />
        </div>
      </div>
    </AbsoluteFill>
  );
}

/** The box a text line occupies in the frame (from the renderer's layout), for the wipe window; the safe zone when unknown. */
function layout(line: EdlText, width: number, height: number): { x: number; y: number; width: number; height: number } {
  const hit = lastLayouts.get(line.id);
  if (hit && hit.width === width) return hit.box;
  const z = safeZoneFor(width, height);
  return { x: z.x, y: z.y, width: z.width, height: z.height };
}
const lastLayouts = new Map<string, { width: number; box: { x: number; y: number; width: number; height: number } }>();

/** The Instagram/TikTok safe zone as a dashed box, for checking the preview; never in the export. */
function SafeZoneLayer({ width, height }: { width: number; height: number }) {
  const z = safeZoneFor(width, height);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: z.x, top: z.y, width: z.width, height: z.height, border: "4px dashed rgba(45,156,255,0.9)", borderRadius: 12, boxSizing: "border-box" }} />
    </AbsoluteFill>
  );
}

// The ending's face. Drawn only once it has loaded, or the first play shows a fallback serif running off the frame.
const endFont = () => ({ fontFamily: familyOf("anton"), waitUntilDone: () => loadEditorFont("anton") });

/**
 * The place, the ask and the website over the last shot, no box. Set to leave
 * the picture readable behind it (the payoff, like the pizza cut into four,
 * stays the last thing seen), and the right side clear of the app's icons.
 */
function EndCardLayer({ card, width, accent, variant, scriptFamily }: { card: EndCard; width: number; /** the theme's accent for the ask; white without a theme */ accent?: string; /** "lockup": the Showroom ending, the ask in the script face over a soft dim */ variant?: "cta" | "lockup"; scriptFamily?: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const family = endFont().fontFamily;
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    const handle = delayRender("ending font", { timeoutInMilliseconds: 30_000 });
    endFont().waitUntilDone().catch(() => null).finally(() => { if (alive) setReady(true); continueRender(handle); });
    return () => { alive = false; };
  }, []);
  const appear = interpolate(frame, [0, 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pop = interpolate(frame, [0, 5], [0.92, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const line = (text: string, base: number, stroke: number) => {
    if (!text) return null;
    const size = endLineSize(text, base, width);
    return <div style={{ fontSize: size, lineHeight: 1.12, WebkitTextStroke: `${Math.round((stroke * 2 * width) / 1080)}px #000`, paintOrder: "stroke fill", whiteSpace: "nowrap" }}>{text}</div>;
  };
  if (!ready) return null;
  if (variant === "lockup") {
    // The hand-cut rug reels' close: the picture dims softly, the ask lands in gold script on a spring, the place
    // and the site under it in spaced capitals.
    const gold = accent ?? "#f2c25b";
    const dim = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
    const cta = spring({ frame: frame - 6, fps, config: { damping: 20, stiffness: 120, mass: 0.9 }, durationInFrames: 22 });
    const sub = interpolate(frame, [18, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const px = (n: number) => Math.round((n * width) / 1080);
    return (
      <AbsoluteFill>
        <AbsoluteFill style={{ backgroundImage: "radial-gradient(ellipse 90% 70% at 50% 45%, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.78) 100%)", opacity: dim }} />
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", paddingBottom: "8%" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: px(18), textAlign: "center", opacity: cta, transform: `translateY(${(1 - cta) * 40}px)` }}>
            <div style={{ fontFamily: scriptFamily ?? family, fontWeight: 400, fontSize: endLineSize(card.cta, scriptFamily ? 104 : 150, width), lineHeight: 1.1, padding: `0 ${px(20)}px`, backgroundImage: `linear-gradient(180deg, ${lighten(gold)} 0%, ${gold} 45%, ${darken(gold)} 100%)`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", filter: "drop-shadow(0 3px 3px rgba(0,0,0,0.6))", whiteSpace: "pre-wrap", maxWidth: "92%" }}>{card.cta}</div>
            {card.location && <div style={{ fontFamily: family, fontWeight: 400, fontSize: endLineSize(card.location.toUpperCase(), 44, width), letterSpacing: px(6), color: "#fff", textShadow: "0 2px 4px rgba(0,0,0,0.55), 0 8px 24px rgba(0,0,0,0.45)", opacity: sub, textTransform: "uppercase", whiteSpace: "nowrap" }}>{card.location}</div>}
            {card.site && <div style={{ fontFamily: family, fontWeight: 400, fontSize: endLineSize(card.site, 38, width), letterSpacing: px(3), color: "rgba(255,255,255,0.85)", opacity: sub, whiteSpace: "nowrap" }}>{card.site}</div>}
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingRight: `${(40 / 1080) * 100}%`, paddingBottom: "30%", opacity: appear, transform: `scale(${pop})` }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: (18 * width) / 1080, fontFamily: family, fontWeight: 400, color: "#fff", textAlign: "center", textShadow: "0 2px 24px rgba(0,0,0,0.55)" }}>
        {line(card.location.toUpperCase(), 92, 5)}
        <div style={{ color: accent ?? "#fff" }}>{line(card.cta.toUpperCase(), 190, 7)}</div>
        {line(card.site.toUpperCase(), 84, 5)}
      </div>
    </AbsoluteFill>
  );
}

/** A caption word settles in this many frames: from a little big and soft to sharp (measured on Noah's picks, 2026-11-12). */
const WORD_SETTLE_FRAMES = 5;

/** Words that never carry a line: the key word of a "script" caption page is the last word that is not one of these. */
const SMALL_WORDS = new Set(["the", "a", "an", "and", "or", "but", "so", "to", "of", "in", "on", "at", "for", "with", "by", "from", "is", "are", "was", "were", "be", "been", "it", "its", "it's", "this", "that", "these", "those", "i", "you", "we", "they", "he", "she", "me", "my", "your", "our", "us", "them", "his", "her", "if", "as", "than", "then", "just", "very", "really", "here", "there", "do", "does", "did", "have", "has", "had", "can", "could", "would", "should", "will", "not", "no", "yes", "up", "out", "how", "what", "huh", "um", "uh", "like"]);
export function keyWordOf(words: string[]): number {
  const clean = words.map((w) => w.toLowerCase().replace(/[^\p{L}\p{N}'$%]/gu, ""));
  for (let i = clean.length - 1; i >= 0; i--) if (clean[i].length >= 3 && !SMALL_WORDS.has(clean[i])) return i;
  return clean.length ? clean.length - 1 : -1;
}
const hexRgb = (hex: string): [number, number, number] => { const h = hex.replace("#", ""); const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h; return [parseInt(v.slice(0, 2), 16) || 0, parseInt(v.slice(2, 4), 16) || 0, parseInt(v.slice(4, 6), 16) || 0]; };
const mix = (hex: string, to: number, k: number): string => { const [r, g, b] = hexRgb(hex); const m = (c: number) => Math.round(c + (to - c) * k).toString(16).padStart(2, "0"); return `#${m(r)}${m(g)}${m(b)}`; };
/** A lighter and a darker step of the highlight colour, for the gold's top light and bottom shade. */
const lighten = (hex: string) => mix(hex, 255, 0.45);
const darken = (hex: string) => mix(hex, 0, 0.35);
/** A voiced line fades in and out over this many frames, and keeps this many after its last word, so it never clicks or clips a breath. */
const VOICE_FADE_FRAMES = 3;
const VOICE_TAIL_FRAMES = 6;

/**
 * One caption page in the cut's caption style (lib/studioClips/style.ts
 * CAPTION_STYLES): the words of the page, the spoken word marked the style's
 * way (brighter, filled, coloured, boxed or underlined with a marker), and
 * the page coming in with the style's motion. Everything is driven by the
 * frame, so the Player and the browser render agree.
 */
export function CaptionPage({ page, style, fontFamily, scriptFamily, emphasis, theme, lowerThird }: { page: TikTokPage; style: EdlStyle; fontFamily: string; /** the face the key word of a "script" page is set in; absent = the caption face */ scriptFamily?: string; /** normalised words to colour, one a line at most (lib/clipper/emphasis.ts) */ emphasis?: string[]; /** the cut's theme, for its type scale, spacing, alignment and pill colour */ theme?: Theme | null; /** a lower third is on screen: captions keep clear of it */ lowerThird?: boolean }) {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const nowMs = page.startMs + (frame / fps) * 1000;
  const spec = captionStyle(style.captions.preset);
  const base0 = captionLayout(style.captions);
  const ty = theme?.typography;
  // A lower third sits at the bottom of the safe zone: captions set low move up above it so the two never overlap.
  const base = lowerThird && base0.bottom && style.captions.position === "bottom" ? { ...base0, bottom: "38%" } : base0;
  // One word at a time reads at half again the size; a theme scales the type on top.
  const l = { ...base, fontSize: Math.round(base.fontSize * (spec.maxWords === 1 ? 1.5 : 1) * (ty?.sizeScale ?? 1) * (width / 1080)) };
  const outline = style.textBox === "outline";
  const hi = style.captions.highlight;
  const left = spec.id === "vox" || ty?.align === "left";
  const animation: CaptionAnimation = style.captions.animation ?? spec.animation;
  // The page's entrance: a spring pop, a short rise, a fade, a bounce, letters typed in, or nothing.
  const enter = spring({ frame, fps, config: { damping: 14, stiffness: 220, mass: 0.6 }, durationInFrames: 10 });
  const bounce = spring({ frame, fps, config: { damping: 7, stiffness: 260, mass: 0.7 }, durationInFrames: 14 });
  const pageStyle: React.CSSProperties =
    animation === "pop" ? { transform: `scale(${interpolate(enter, [0, 1], [0.6, 1])})`, opacity: Math.min(1, frame / 2) }
    : animation === "rise" ? { transform: `translateY(${interpolate(enter, [0, 1], [18, 0])}px)`, opacity: Math.min(1, frame / 3) }
    : animation === "fade" ? { opacity: Math.min(1, frame / 4) }
    : animation === "bounce" ? { transform: `scale(${interpolate(bounce, [0, 1], [0.5, 1])})`, opacity: Math.min(1, frame / 2) }
    : {};
  const stroke = outline && !style.captions.box ? { fontWeight: outlineWeight(style.font), WebkitTextStroke: `${Math.max(9, Math.round(l.fontSize * 0.18))}px #000`, paintOrder: "stroke fill" as const } : {};
  const tokens = page.tokens.filter((t) => t.text.trim());
  // Typewriter: the page's letters arrive a few a frame; the words before the cursor are shown, the rest held back.
  const typed = animation === "typewriter" ? Math.floor(frame * 2.5) : Infinity;
  let seen = 0;
  const pill = style.captions.box ? (theme ? `${theme.color.captionBg}b8` : "rgba(0,0,0,0.42)") : "transparent";
  // The key word of the line (a marked word, else a number) keeps the highlight colour the whole time the page is up.
  const keyWord = emphasis?.length ? emphasisIndex(tokens.map((t) => t.text), emphasis) : spec.mark === "script" ? keyWordOf(tokens.map((t) => t.text)) : -1;
  const wordColor = (i: number, fallback: string) => (i === keyWord ? hi : fallback);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center" }}>
      <div style={{ position: "absolute", ...(l.top ? { top: l.top } : { bottom: l.bottom! }), left: left ? "8%" : "6%", right: left ? "14%" : "6%", textAlign: left ? "left" : "center", ...pageStyle }}>
        <span
          style={{
            display: "inline-block", fontFamily, fontWeight: outlineWeight(style.font) === 400 ? 400 : ty?.weight && ty.weight >= 700 ? ty.weight : 700, fontSize: l.fontSize, lineHeight: left ? 1.35 : 1.2, whiteSpace: "pre-wrap",
            textTransform: style.captions.uppercase ? "uppercase" : "none",
            letterSpacing: ty?.letterSpacing ? `${ty.letterSpacing}em` : undefined,
            padding: "10px 18px", borderRadius: 16, backgroundColor: pill,
            textShadow: style.captions.box || outline ? "none" : "0 2px 14px rgba(0,0,0,0.8)",
            ...stroke,
          }}
        >
          {tokens.map((t, i) => {
            const active = t.fromMs <= nowMs && t.toMs > nowMs;
            const spoken = t.toMs <= nowMs;
            // How far the marker or fill has swept across this word, 0..1.
            const sweep = active ? Math.min(1, Math.max(0, (nowMs - t.fromMs) / Math.max(80, t.toMs - t.fromMs))) : spoken ? 1 : 0;
            const full = i === 0 ? t.text.trimStart() : t.text;
            const start = seen; seen += full.length;
            if (typed <= start) return null;
            const text = typed >= seen ? full : full.slice(0, typed - start);
            if (spec.mark === "script") {
              // The hand-cut rug reels: each word slams in (big, a touch of tilt) as it is said and stays; the key
              // word is set in the script face, in gold, a size up. The pill is laid out for the whole phrase from
              // the start, so nothing jumps as words land.
              const since = (nowMs - t.fromMs + 100) / 1000 * fps;
              const landed = since >= 0;
              const k = spring({ frame: Math.max(0, since), fps, config: { damping: 14, stiffness: 190, mass: 0.7 }, durationInFrames: 14 });
              const slam = 1.55 - 0.55 * k;
              const key = i === keyWord;
              return (
                <span
                  key={`${t.fromMs}-${i}`}
                  style={{
                    display: "inline-block", whiteSpace: "pre", visibility: landed ? "visible" : "hidden",
                    opacity: Math.min(1, Math.max(0, since) / 3),
                    transform: key ? `scale(${slam}) rotate(${-6 * (1 - k)}deg)` : `scale(${slam}) translateY(${(1 - k) * 10}px)`,
                    transformOrigin: key ? "center 70%" : "center bottom",
                    ...(key ? { fontFamily: scriptFamily ?? fontFamily, fontWeight: 400, fontSize: Math.round(l.fontSize * 1.5), lineHeight: 1, padding: "0 0.08em", backgroundImage: `linear-gradient(180deg, ${lighten(hi)} 0%, ${hi} 45%, ${darken(hi)} 100%)`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", filter: `drop-shadow(0 3px 3px rgba(0,0,0,0.6)) drop-shadow(0 0 22px ${hi}${since < 24 ? "80" : "50"})` } : { color: "#fff" }),
                  }}
                >
                  {text}
                </span>
              );
            }
            if (spec.mark === "marker") {
              // Vox: a highlighter bar grows under the word as it is said and stays.
              return (
                <span key={`${t.fromMs}-${i}`} style={{ position: "relative", color: wordColor(i, "#fff"), zIndex: 1 }}>
                  <span style={{ position: "absolute", left: 0, bottom: "8%", height: "38%", width: `${sweep * 100}%`, background: hi, opacity: 0.85, zIndex: -1, borderRadius: 4 }} />
                  {text}
                </span>
              );
            }
            if (spec.mark === "box") {
              return (
                <span key={`${t.fromMs}-${i}`} style={{ display: "inline-block", color: i === keyWord && !active ? hi : "#fff", padding: "0 0.18em", margin: "0 0.1em", borderRadius: Math.round(l.fontSize * 0.18), backgroundColor: active ? hi : "transparent", transform: active ? "scale(1.06)" : "scale(1)" }}>
                  {t.text.trim()}
                </span>
              );
            }
            if (spec.mark === "fill") {
              // Karaoke: a coloured copy of the word, clipped to how much of it has been said, over the white one.
              return (
                <span key={`${t.fromMs}-${i}`} style={{ position: "relative", display: "inline-block", color: wordColor(i, "#fff"), whiteSpace: "pre" }}>
                  {text}
                  <span aria-hidden style={{ position: "absolute", left: 0, top: 0, width: `${sweep * 100}%`, overflow: "hidden", whiteSpace: "pre", color: hi }}>{text}</span>
                </span>
              );
            }
            if (spec.mark === "colour") {
              return (
                <span key={`${t.fromMs}-${i}`} style={{ display: "inline-block", color: active ? hi : wordColor(i, "#fff"), transform: active ? "scale(1.12)" : "scale(1)" }}>
                  {text}
                </span>
              );
            }
            if (spec.mark === "bright") {
              return <span key={`${t.fromMs}-${i}`} style={{ color: wordColor(i, active ? "#fff" : "rgba(255,255,255,0.72)") }}>{text}</span>;
            }
            return <span key={`${t.fromMs}-${i}`} style={{ color: wordColor(i, "#fff") }}>{text}</span>;
          })}
        </span>
      </div>
    </AbsoluteFill>
  );
}

type Effects = ReturnType<typeof colorCorrection>[];

/**
 * One cut, with its transitions: how it comes in from the cut before and how
 * it leaves into the next (lib/studioClips/transitions.ts). Blur is a WebGL
 * effect on the video itself, so the Player and the browser render agree.
 */
/** The theme's look as WebGL effects for one frame (lib/studioClips/look.ts). */
function lookEffects(plan: LookStep[]): Effects {
  return plan.map((st) => {
    switch (st.kind) {
      case "color": return colorCorrection(st.params);
      case "vignette": return vignette({ amount: st.amount, radius: st.radius, feather: st.feather });
      case "grain": return noise({ amount: st.amount, seed: st.seed });
      case "chroma": return chromaticAberration({ amount: st.amount, angle: 0 });
      case "scanlines": return scanlines({ amount: st.amount, spacing: st.spacing });
    }
  }) as Effects;
}

function SegmentLayer({ s, index, into, out, effects, theme, softenFrom, children }: {
  s: TimelineSegment; index: number; into: TransitionKind | undefined; out: TransitionKind | undefined; effects: Effects | undefined;
  theme: Theme | null;
  /** The frame of this cut where it softens behind the ending, when it is the last one and the cut has an ending card. */
  softenFrom?: number;
  children: (p: { effects: Effects | undefined; frame: number; cssFilter?: string }) => React.ReactNode;
}) {
  const f = useCurrentFrame();
  const { width } = useVideoConfig();
  const soft = softenFrom == null ? 0 : interpolate(f, [softenFrom, softenFrom + END_SOFTEN_FRAMES], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const look = transitionLook({ frame: f, frames: s.durationFrames, into, overlapIn: s.overlapIn, out, overlapOut: s.overlapOut });
  // Punch-ins: a continuous take steps in and back out where it would have cut (lib/studioClips/punch.ts).
  const clipSec = clipSecAt(s, f);
  const punch = s.punches?.length ? punchScaleAt(s, clipSec) : 1;
  // The cut's own motion (lib/studioClips/motion.ts): the slow move, word punches and shake, one transform with the transition's.
  const mo = motionAt(s.motion, f, s.durationFrames, clipSec, index);
  const css = transformCss({ ...mo, scale: mo.scale * look.scale * punch, x: mo.x + look.x / 100, y: mo.y + look.y / 100 });
  const fx: Effects = [...(effects ?? []), ...lookEffects(lookPlan(theme?.color.grade, s.startFrame + f, width))];
  if (look.zoomBlur > 0.5) fx.push(zoomBlur({ amount: look.zoomBlur, samples: 16 }));
  if (look.blur > 0.5) fx.push(blur({ radius: look.blur, vertical: look.whip ? false : true }));
  if (look.noise > 0) fx.push(noise({ amount: 0.6 * look.noise, seed: f }));
  // The Player's video element takes no WebGL effects: the grade and a join's blur become a CSS filter there.
  const cssFilter = [lookCssFilter(theme?.color.grade), look.blur > 0.5 ? `blur(${Math.round(look.blur / 4)}px)` : undefined, look.zoomBlur > 0.5 ? `blur(${Math.round(look.zoomBlur / 8)}px)` : undefined].filter(Boolean).join(" ") || undefined;
  // Behind the ending the picture stays sharp (its last shot is the payoff); only the bottom darkens for the words.
  return (
    <AbsoluteFill style={{ opacity: look.opacity, transform: css.transform, transformOrigin: css.transformOrigin }}>
      {children({ effects: fx.length ? fx : undefined, frame: f, cssFilter })}
      {look.flash > 0 ? <AbsoluteFill style={{ background: "#fff", opacity: look.flash, pointerEvents: "none" }} /> : null}
      {soft > 0 && <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.25) 45%, rgba(0,0,0,0) 70%)", opacity: soft }} />}
    </AbsoluteFill>
  );
}

/** A clip's picture inside a cut, in constant-rate pieces (a speed ramp is two or three of them). Sound stays on the first child's volume callback. */
function SegmentVideo({ s, src, effects, cssFilter, volume, muted, objectFit, style }: { s: TimelineSegment; src: string; effects: Effects | undefined; /** the look for the Player's video element (no WebGL there) */ cssFilter?: string; volume: (f: number) => number; muted: boolean; objectFit: "cover" | "fill"; style: React.CSSProperties }) {
  const preview = useContext(PreviewCtx);
  const pieces = speedPieces(s);
  if (pieces.length === 1 && pieces[0].rate === 1) {
    return <ShotVideo preview={preview} src={src} trimBefore={s.inFrame} frames={s.durationFrames} effects={effects} cssFilter={cssFilter} volume={volume} muted={muted} objectFit={objectFit} style={style} />;
  }
  let from = 0;
  return (
    <>
      {pieces.map((p, i) => {
        const at = from; from += p.frames;
        return (
          <Sequence key={i} from={at} durationInFrames={p.frames} name={`${p.rate}x`}>
            <ShotVideo preview={preview} src={src} trimBefore={secToFrames(p.in)} frames={p.frames} playbackRate={p.rate} effects={effects} cssFilter={cssFilter} volume={(f) => volume(at + f)} muted={muted} objectFit={objectFit} style={style} />
          </Sequence>
        );
      })}
    </>
  );
}

/**
 * One run of a clip at one rate. In the export: @remotion/media's decoder, frame-accurate, with the WebGL look.
 * In the Player: the browser's video element, which buffers and seeks during the shot's premount so the cut
 * lands on a drawn frame (the decoder started at the cut and left ~0.4 s of black at every join: bug 37);
 * the look is a CSS filter there, and playback pauses to buffer rather than skipping.
 */
function ShotVideo({ preview, src, trimBefore, frames, playbackRate, effects, cssFilter, volume, muted, objectFit, style }: { preview: boolean; src: string; trimBefore: number; frames: number; playbackRate?: number; effects: Effects | undefined; cssFilter?: string; volume: ((f: number) => number) | number; muted: boolean; objectFit: "cover" | "fill"; style: React.CSSProperties }) {
  if (!preview) return <Video src={src} trimBefore={trimBefore} durationInFrames={frames} playbackRate={playbackRate} effects={effects} volume={volume} muted={muted} objectFit={objectFit} style={style} />;
  return <Html5Video src={src} trimBefore={trimBefore} trimAfter={trimBefore + frames} playbackRate={playbackRate} volume={volume} muted={muted} pauseWhenBuffering style={{ ...style, objectFit, filter: cssFilter }} />;
}

/** A B-roll shot over the picture: in and out over 4 frames, with the theme's look. */
function BrollLayer({ frames, theme, children }: { frames: number; theme: Theme | null; children: (fx: Effects | undefined) => React.ReactNode }) {
  const f = useCurrentFrame();
  const { width } = useVideoConfig();
  const op = Math.min(1, (f + 1) / 4, (frames - f) / 4);
  const fx = lookEffects(lookPlan(theme?.color.grade, f, width));
  return <AbsoluteFill style={{ opacity: Math.max(0, op) }}>{children(fx.length ? fx : undefined)}</AbsoluteFill>;
}

/** Black bars top and bottom (the Cinematic theme). */
function Letterbox({ px }: { px: number }) {
  if (px <= 0) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: px, background: "#000" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: px, background: "#000" }} />
    </AbsoluteFill>
  );
}

/** A thin bar along the bottom that fills as the video plays (a theme's progress bar). */
function ProgressBar({ total, color }: { total: number; color: string }) {
  const f = useCurrentFrame();
  const { width } = useVideoConfig();
  const h = Math.max(4, Math.round((8 * width) / 1080));
  return (
    <AbsoluteFill style={{ pointerEvents: "none", justifyContent: "flex-end" }}>
      <div style={{ height: h, width: "100%", background: "rgba(255,255,255,0.18)" }}>
        <div style={{ height: "100%", width: `${Math.min(100, (f / Math.max(1, total - 1)) * 100)}%`, background: color }} />
      </div>
    </AbsoluteFill>
  );
}

/**
 * The lower third: a name and a line under it, bottom-left inside the safe
 * zone, in the theme's style (a dark tag, an accent pill, or a bar with an
 * accent edge). It slides in over 8 frames and stays.
 */
function LowerThird({ name, line, theme, fontFamily }: { name: string; line: string; theme: Theme; fontFamily: string }) {
  const f = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const zone = safeZoneFor(width, height);
  const k = spring({ frame: f, fps, config: { damping: 18, stiffness: 180 }, durationInFrames: 10 });
  const s = width / 1080;
  const kind = theme.layout.lowerThird;
  if (kind === "none" || (!name && !line)) return null;
  const base: React.CSSProperties = { position: "absolute", left: zone.x, bottom: height - (zone.y + zone.height), maxWidth: zone.width * 0.8, fontFamily, color: "#fff", transform: `translateX(${(1 - k) * -40}px)`, opacity: Math.min(1, f / 4) };
  const nameStyle: React.CSSProperties = { fontSize: 40 * s, fontWeight: 700, lineHeight: 1.15 };
  const lineStyle: React.CSSProperties = { fontSize: 28 * s, fontWeight: 600, opacity: 0.85, lineHeight: 1.2 };
  if (kind === "bar") {
    return (
      <div style={{ ...base, borderLeft: `${Math.round(10 * s)}px solid ${theme.color.accent}`, paddingLeft: 22 * s, textShadow: "0 2px 14px rgba(0,0,0,0.7)" }}>
        {name && <div style={nameStyle}>{name}</div>}
        {line && <div style={lineStyle}>{line}</div>}
      </div>
    );
  }
  const fill = kind === "pill" ? theme.color.accent : "rgba(0,0,0,0.72)";
  const color = kind === "pill" ? readable(theme.color.accent) : "#fff";
  return (
    <div style={{ ...base, background: fill, color, padding: `${12 * s}px ${22 * s}px`, borderRadius: kind === "pill" ? 999 : 12 * s }}>
      {name && <div style={nameStyle}>{name}</div>}
      {line && <div style={lineStyle}>{line}</div>}
    </div>
  );
}

const readable = (hex: string): string => { const n = parseInt(hex.slice(1), 16); const l = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255); return l > 150 ? "#000" : "#fff"; };

/** A camcorder corner: REC with a blinking dot and the running time (the Retro theme). Never an invented date. */
function DateStamp({ fontFamily, color, hideFrames }: { fontFamily: string; color: string; /** frame ranges a text line is up: the stamp steps aside so the two never overlap */ hideFrames: [number, number][] }) {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const zone = safeZoneFor(width, height);
  const s = width / 1080;
  const t = f / FPS;
  if (hideFrames.some(([a, b]) => f >= a - 2 && f < b + 2)) return null;
  const mm = String(Math.floor(t / 60)).padStart(2, "0"), ss = String(Math.floor(t % 60)).padStart(2, "0");
  return (
    <div style={{ position: "absolute", left: zone.x, top: zone.y, fontFamily, color, fontSize: 36 * s, letterSpacing: "0.08em", textShadow: "0 2px 10px rgba(0,0,0,0.8)", display: "flex", alignItems: "center", gap: 14 * s }}>
      <span style={{ width: 18 * s, height: 18 * s, borderRadius: "50%", background: "#ff2a2a", opacity: Math.floor(f / 15) % 2 ? 1 : 0.25 }} />
      REC {mm}:{ss}
    </div>
  );
}

/** A small brand mark in the top-right corner, inside the safe zone. */
function Watermark({ url }: { url: string }) {
  const { width, height } = useVideoConfig();
  const zone = safeZoneFor(width, height);
  const size = Math.round(88 * (width / 1080));
  return <Img src={url} style={{ position: "absolute", right: width - (zone.x + zone.width), top: zone.y, width: size, height: size, objectFit: "contain", opacity: 0.85 }} pauseWhenLoading />;
}

export const ClipComposition: React.FC<ClipCompositionProps> = ({ edl, sources, captionsOn, ranking, captionWords, emphasis, finishOn, musicUrl, voiceUrls, cleanAudio, safeZoneGuide, watermarkUrl, preview }) => {
  const { fps, width, height } = useVideoConfig();
  const style = edl.style ?? DEFAULT_STYLE;
  // The cut's theme with the person's overrides (lib/studioClips/themes): the look, the overlays, the caption type.
  const theme = useMemo(() => resolveTheme(edl), [edl]);
  const bars = letterboxPx(theme?.color.grade, height);
  const hasLowerThird = Boolean(theme && theme.layout.lowerThird !== "none" && edl.lowerThird && (edl.lowerThird.name || edl.lowerThird.line));
  const fontFamily = useMemo(() => familyFor(style.font), [style.font]);
  // The theme's second face (the key word of a "script" caption page, the ending's line): loaded with the cut's own.
  const scriptFont = theme?.typography.scriptFont as FontId | undefined;
  const scriptFamily = useMemo(() => (scriptFont ? familyFor(scriptFont) : undefined), [scriptFont]);
  useEffect(() => {
    if (!scriptFont) return;
    const handle = delayRender(`font ${scriptFont}`, { timeoutInMilliseconds: 30_000 });
    loadEditorFont(scriptFont).catch(() => null).finally(() => continueRender(handle));
  }, [scriptFont]);
  // Captions and the lower third are DOM text: the frame waits for the face so no frame is painted in a fallback.
  useEffect(() => {
    const handle = delayRender(`font ${style.font}`, { timeoutInMilliseconds: 30_000 });
    loadEditorFont(style.font).catch(() => null).finally(() => continueRender(handle));
  }, [style.font]);
  // Shots that change during the cut (the AI Clipper): the picture for this frame on its path.
  const pathBox = (s: { clipId: string; frame?: SegmentFrame }, local: number) => {
    const src = sources[s.clipId];
    if (ranking && src?.width && src?.height) return rankingBox(src.width, src.height, width, height, ranking.items.length, s.frame?.path ? viewAt(s.frame.path, local / FPS).c : 0.5);
    return s.frame?.path && src?.width && src?.height ? viewBox(src.width, src.height, width, height, viewAt(s.frame.path, local / FPS)) : null;
  };
  const box = (s: { clipId: string; frame?: { zoom: number; x: number; y: number } }) => videoBox(sources[s.clipId]?.width ?? null, sources[s.clipId]?.height ?? null, width, height, s.frame);
  const tl = useMemo(() => timeline(edl), [edl]);
  // Measured balance, expressed as attenuation so no clip is pushed above unity; a raise larger than
  // SPEECH_CUT_DB is not taken out of the others (that pulled a voice down 8 dB to lift a quiet clip).
  const maxGain = useMemo(() => Math.min(SPEECH_CUT_DB, Math.max(0, ...tl.segments.map((s) => s.gainDb))), [tl]);
  const words = useMemo(() => Object.fromEntries(Object.values(sources).map((s) => [s.clipId, s.words])), [sources]);
  // With a soundtrack, the clips' own sound plays at the level the person chose for it.
  const music = edl.soundtrack && musicUrl ? edl.soundtrack : null;
  const original = music ? music.originalVolume : 1;
  const finish = finishOn === false ? undefined : edl.finish;
  // The ending card shows when the theme has an outro (or the cut has no theme).
  const card = edl.endCard && (!theme || theme.layout.outro !== "none") ? edl.endCard : null;
  // The ending's font starts loading with the video, not when the card is due (a first play hitched at the card).
  useEffect(() => { if (card) void endFont().waitUntilDone().catch(() => null); }, [card]);
  // One effect instance per graded clip, so the WebGL program isn't rebuilt every frame.
  const effects = useMemo(() => {
    if (!finish || finish.look === "off") return {} as Record<string, ReturnType<typeof colorCorrection>[]>;
    return Object.fromEntries(Object.entries(finish.grades).map(([id, g]) => [id, [colorCorrection(g.params)]]));
  }, [finish]);
  // Each caption style sets its own words per page and page length (lib/studioClips/style.ts).
  const capSpec = captionStyle(style.captions.preset);
  const pageWords = captionWords ?? capSpec.maxWords;
  const pageMs = capSpec.pageMs;
  // One text at a time: the captions step aside while a designed line or the ending card is up.
  const cardFrom = card ? tl.durationFrames - END_FRAMES + END_SOFTEN_FRAMES : Infinity;
  const pages = useMemo(() => (captionsOn ? clearOfText(captionPages(edl, words, fps, pageMs, pageWords), edl, fps, cardFrom) : []), [edl, words, captionsOn, fps, pageMs, pageWords, cardFrom]);
  // With ducking on, the music sits low under speech and comes up between (lib/studioClips/musicDuck.ts).
  const spoken = useMemo(() => (music?.duck ? speechSpans(edl, words) : []), [music?.duck, edl, words]);
  // A voiceover (lib/studioClips/voiceover.ts): its voiced lines play where they sit, and the
  // clips' own sound and the music dip under it.
  const voice = edl.voiceover?.on && voiceUrls ? edl.voiceover : null;
  const voiced = useMemo(() => (voice ? voice.lines.filter((l) => l.path && voiceUrls?.[l.path] && l.dur && l.at < tl.durationSec) : []), [voice, voiceUrls, tl.durationSec]);
  const voiceSp = useMemo(() => (voiced.length ? voiceSpans(voice, tl.durationSec) : []), [voiced, voice, tl.durationSec]);
  const underVoiceover = (t: number) => (voiceSp.length ? duckLevel(t, voiceSp, UNDER_VOICEOVER) : 1);

  return (
    <PreviewCtx.Provider value={Boolean(preview)}>
    <AbsoluteFill style={{ backgroundColor: "#000", fontFamily }}>
      {tl.segments.map((s, i) => {
        const src = sources[s.clipId];
        if (!src) return null;
        const gain = dbToGain(s.gainDb - maxGain);
        const sound = finish?.sound ? finish.sounds[s.clipId] : undefined;
        const next = tl.segments[i + 1];
        const cleaned = edl.cleanSound ? cleanAudio?.[s.clipId] : undefined;
        // An L-cut (s.voiceTail): this shot's voice runs on over the next shot, so its sound doesn't fade
        // out at the cut, and the next shot's own sound sits low under it.
        const tailFrames = s.voiceTail && next ? Math.min(secToFrames(s.voiceTail), next.durationFrames) : 0;
        const prevTail = i ? tl.segments[i - 1] : null;
        const underFrames = prevTail?.voiceTail ? Math.min(secToFrames(prevTail.voiceTail), s.durationFrames) : 0;
        const envelope = (f: number) => (tailFrames ? Math.min(1, (f + 1) / EDGE_FADE_FRAMES) : edgeEnvelope(f, s.durationFrames));
        const gainAt = (t: number) => (sound ? dbToGain(gainAtDb(sound, t)) : Math.min(1, gain)) * (s.volume ?? 1) * original;
        const level = (f: number) => gainAt(s.in + f / FPS) * envelope(f) * underVoice(f, underFrames) * transitionSound(f, s.durationFrames, s.overlapIn, s.overlapOut) * underVoiceover(s.startSec + f / FPS);
        // premountFor: the Player loads the next shot before it is on screen. Without it the shot started
        // loading as the transition began, so it arrived late and the join stuttered. A render ignores it.
        return (
          <React.Fragment key={s.id}>
            <Sequence from={s.startFrame} durationInFrames={s.durationFrames} premountFor={PREMOUNT_FRAMES} name={`${s.role} · clip ${src.position + 1}`}>
              <SegmentLayer s={s} index={i} into={i ? s.transition : undefined} out={next?.transition} effects={effects[s.clipId]} theme={theme} softenFrom={card && !next ? Math.max(0, s.durationFrames - END_FRAMES) : undefined}>
                {({ effects: fx, frame: local, cssFilter }) => (
                  <SegmentVideo
                    s={s}
                    cssFilter={cssFilter}
                    // The stabilized copy when the cut asks for one and it has been made (lib/studioClips/stabilize.ts).
                    src={(s.stabilize && src.stable?.[s.stabilize.strength]) || src.url}
                    effects={fx}
                    // Cleanup on: the measured gain curve (it may lift quiet sound; its peaks were measured
                    // to stay under -1 dBFS). Off: the Phase B balance, as attenuation only. Sound crossfades
                    // with the picture through a transition.
                    // With the noise reduced, the clip's own sound is replaced by the cleaned track below.
                    volume={cleaned ? () => 0 : level}
                    muted={Boolean(cleaned)}
                    // Cover the frame, never letterboxed: sized to the footage's own aspect and the
                    // person's reframe (videoBox), or centred cover when the size isn't known.
                    objectFit={box(s) ? "fill" : "cover"}
                    style={pathBox(s, local) ?? box(s) ?? { width: "100%", height: "100%" }}
                  />
                )}
              </SegmentLayer>
              {cleaned && <Audio src={cleaned} trimBefore={s.inFrame} durationInFrames={s.durationFrames} volume={level} />}
            </Sequence>
            {tailFrames > 0 && (
              <Sequence from={s.startFrame + s.durationFrames} durationInFrames={tailFrames} premountFor={PREMOUNT_FRAMES} name="voice carries over">
                <Audio src={cleaned ?? src.url} trimBefore={s.inFrame + s.durationFrames} durationInFrames={tailFrames} volume={(f) => gainAt(s.out + f / FPS) * voiceTailEnvelope(f, tailFrames)} />
              </Sequence>
            )}
          </React.Fragment>
        );
      })}
      {theme?.audio.sfx && tl.segments.slice(1).map((s) => (
        // A whoosh on every join (the Energetic theme): starts a few frames before the cut so the sound lands on it.
        <Sequence key={`sfx-${s.id}`} from={Math.max(0, s.startFrame - SFX_LEAD_FRAMES)} durationInFrames={SFX_FRAMES} name="cut sound">
          <Audio src={SFX_WHOOSH} volume={SFX_LEVEL} />
        </Sequence>
      ))}
      {theme?.audio.pops && [...edl.text.filter((t) => t.text.trim()).map((t) => ({ id: t.id, at: secToFrames(t.at) })), ...(card ? [{ id: "ending", at: Math.max(0, tl.durationFrames - END_FRAMES + END_SOFTEN_FRAMES + 4) }] : [])].map((p) => (
        // A soft pop as a line or the ending lands (the hand-cut rug reels): a short sine, made with ffmpeg.
        <Sequence key={`pop-${p.id}`} from={p.at} durationInFrames={POP_FRAMES} name="pop">
          <Audio src={SFX_POP} volume={POP_LEVEL} />
        </Sequence>
      ))}
      {(edl.broll ?? []).map((b) => {
        const src = sources[b.clipId];
        const frames = Math.max(1, secToFrames(b.out - b.in));
        if (!src) return null;
        return (
          <Sequence key={b.id} from={secToFrames(b.at)} durationInFrames={frames} premountFor={PREMOUNT_FRAMES} name={`b-roll · clip ${src.position + 1}`}>
            <BrollLayer frames={frames} theme={theme}>
              {(fx) => <ShotVideo preview={Boolean(preview)} src={src.url} trimBefore={secToFrames(b.in)} frames={frames} effects={fx} cssFilter={lookCssFilter(theme?.color.grade)} muted volume={0} objectFit={box(b) ? "fill" : "cover"} style={box(b) ?? { width: "100%", height: "100%" }} />}
            </BrollLayer>
          </Sequence>
        );
      })}
      {bars > 0 && <Letterbox px={bars} />}
      {theme?.layout.progressBar && <ProgressBar total={tl.durationFrames} color={theme.color.accent} />}
      {hasLowerThird && theme && edl.lowerThird && (
        <Sequence from={secToFrames(0.4)} durationInFrames={Math.max(1, tl.durationFrames - secToFrames(0.4))} name="lower third">
          <LowerThird name={edl.lowerThird.name} line={edl.lowerThird.line} theme={theme} fontFamily={fontFamily} />
        </Sequence>
      )}
      {theme?.layout.dateStamp && <Sequence from={0} durationInFrames={tl.durationFrames} name="rec"><DateStamp fontFamily={fontFamily} color={theme.color.text} hideFrames={edl.text.filter((t) => t.text.trim()).map((t) => [secToFrames(t.at), secToFrames(t.end)] as [number, number])} /></Sequence>}
      {theme?.layout.watermark && watermarkUrl && <Watermark url={watermarkUrl} />}
      {music && (
        <Sequence from={0} durationInFrames={tl.durationFrames} name="soundtrack">
          <Audio
            src={musicUrl!}
            volume={(f) => music.musicVolume * Math.min(spoken.length ? duckLevel(f / fps, spoken) : 1, underVoiceover(f / fps)) * Math.min(1, f / MUSIC_FADE_IN, (tl.durationFrames - f) / MUSIC_FADE_OUT)}
          />
        </Sequence>
      )}
      {voice && voiced.map((l) => {
        const from = secToFrames(l.at);
        const frames = Math.max(1, Math.min(secToFrames(l.dur ?? 0) + VOICE_TAIL_FRAMES, tl.durationFrames - from));
        return (
          <Sequence key={l.id} from={from} durationInFrames={frames} premountFor={PREMOUNT_FRAMES} name={`voiceover · ${l.id}`}>
            <Audio src={voiceUrls![l.path!]} volume={(f) => voice.volume * Math.min(1, (f + 1) / VOICE_FADE_FRAMES, (frames - f) / VOICE_FADE_FRAMES)} />
          </Sequence>
        );
      })}
      {edl.text.filter((t) => t.text.trim()).map((t) => (
        // premountFor: the line's image is drawn before it is due. Without it the Player paused about 170 ms
        // the moment a line came on ("sliced to order" at 8.9 s, 2026-11-12): a visible hitch in picture and sound.
        <Sequence key={t.id} from={secToFrames(t.at)} durationInFrames={Math.max(1, secToFrames(t.end - t.at))} premountFor={PREMOUNT_FRAMES} name={`text · ${presetOf(t).label}`}>
          <TextLayer line={t} width={width} height={height} font={style.font} textBox={style.textBox} accent={style.accent} animation={theme?.typography.titleAnimation} />
        </Sequence>
      ))}
      {ranking && <RankingLayer ranking={ranking} fontFamily={fontFamily} />}
      {pages.map((p, i) => (
        <Sequence key={`c${i}`} from={p.from} durationInFrames={p.durationInFrames} name="captions">
          <CaptionPage page={p.page} style={style} fontFamily={fontFamily} scriptFamily={scriptFamily} emphasis={emphasis ?? edl.emphasis} theme={theme} lowerThird={hasLowerThird} />
        </Sequence>
      ))}
      {card && (
        <Sequence from={Math.max(0, tl.durationFrames - END_FRAMES + END_SOFTEN_FRAMES)} premountFor={PREMOUNT_FRAMES} name="ending">
          <EndCardLayer card={card} width={width} accent={theme?.color.accent} variant={theme?.layout.outro === "lockup" ? "lockup" : "cta"} scriptFamily={scriptFamily} />
        </Sequence>
      )}
      {safeZoneGuide && <SafeZoneLayer width={width} height={height} />}
    </AbsoluteFill>
    </PreviewCtx.Provider>
  );
};
