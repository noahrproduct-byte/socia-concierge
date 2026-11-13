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
import { AbsoluteFill, Img, Sequence, continueRender, delayRender, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio, Video } from "@remotion/media";
import { colorCorrection } from "@remotion/effects/color-correction";
import { zoomBlur } from "@remotion/effects/zoom-blur";
import { blur } from "@remotion/effects/blur";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadBebas } from "@remotion/google-fonts/BebasNeue";
import { loadFont as loadTikTok } from "@remotion/google-fonts/TikTokSans";
import { loadFont as loadAnton } from "@remotion/google-fonts/Anton";
import { DEFAULT_STYLE, captionLayout, captionStyle, type EdlStyle, type FontId } from "@/lib/studioClips/style";
import { presetOf, safeZoneFor } from "@/lib/textPresets";
import { renderTextLayer } from "@/lib/textRender";
import type { TikTokPage } from "@remotion/captions";
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

// Inter is the default and loads at once; the others load only when an edit uses them.
const { fontFamily: interFamily } = loadInter("normal", { weights: ["600", "700"], subsets: ["latin", "latin-ext"] });
const FONT_LOADERS: Record<FontId, () => string> = {
  inter: () => interFamily,
  montserrat: () => loadMontserrat("normal", { weights: ["600", "700", "800"], subsets: ["latin", "latin-ext"] }).fontFamily,
  tiktok: () => loadTikTok("normal", { weights: ["700", "800"], subsets: ["latin", "latin-ext"] }).fontFamily,
  anton: () => loadAnton("normal", { weights: ["400"], subsets: ["latin", "latin-ext"] }).fontFamily,
  poppins: () => loadPoppins("normal", { weights: ["600", "700"], subsets: ["latin", "latin-ext"] }).fontFamily,
  playfair: () => loadPlayfair("normal", { weights: ["600", "700"], subsets: ["latin", "latin-ext"] }).fontFamily,
  bebas: () => loadBebas("normal", { weights: ["400"], subsets: ["latin", "latin-ext"] }).fontFamily,
  // Never a whole video's font (sanitizeStyle keeps it out); only Hook Pair's small line uses it, through lib/textFonts.ts.
  serif: () => loadMontserrat("normal", { weights: ["600", "700", "800"], subsets: ["latin", "latin-ext"] }).fontFamily,
};
const loaded = new Map<FontId, string>();
const familyFor = (id: FontId) => { if (!loaded.has(id)) loaded.set(id, FONT_LOADERS[id]()); return loaded.get(id)!; };

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
};

/** The soundtrack fades in over 0.2 s and out over the last 0.8 s, so it never starts or stops abruptly. */
const MUSIC_FADE_IN = 6, MUSIC_FADE_OUT = 24;

/** The ending: the frame softens behind big type in the middle (lib/studioClips/teach.ts). */
const END_FRAMES = Math.round(END_CARD_SEC * FPS);
const END_SOFTEN_FRAMES = 9;

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
function TextLayer({ line, width, height, font, textBox, accent }: { line: EdlText; width: number; height: number; font: FontId; textBox: EdlStyle["textBox"]; accent: string }) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const preset = presetOf(line);
  const args = useMemo(() => ({ presetId: preset.id, text: line.text, slot: line.slot, width, height, font, textBox, accent }), [preset.id, line.text, line.slot, width, height, font, textBox, accent]);
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const handle = delayRender(`text ${line.id}`, { timeoutInMilliseconds: 60_000 });
    renderTextLayer(args)
      .then((r) => { if (alive) setSrc(r.layout.fits ? r.url : null); })
      .catch(() => { if (alive) setSrc(null); })
      .finally(() => continueRender(handle));
    return () => { alive = false; };
  }, [args, line.id]);
  if (!src) return null;
  const inF = Math.max(1, Math.round(fps * 0.25)), outF = Math.max(1, Math.round(fps * 0.25));
  const leave = interpolate(frame, [durationInFrames - outF, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeIn = interpolate(frame, [0, inF], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (textBox !== "outline") {
    // The clean look: the line arrives a little big and soft and settles sharp in WORD_SETTLE_FRAMES, then drifts
    // up very slowly while it is on screen, so it is never static (Noah's picks, 2026-11-12).
    const k = interpolate(frame, [0, WORD_SETTLE_FRAMES], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const ease = 1 - (1 - k) * (1 - k);
    const drift = interpolate(frame, [0, durationInFrames], [0, -0.6], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const out3 = interpolate(frame, [durationInFrames - 3, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
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
let antonFont: ReturnType<typeof loadAnton> | null = null;
const endFont = () => (antonFont ??= loadAnton("normal", { weights: ["400"], subsets: ["latin", "latin-ext"] }));

/**
 * The place, the ask and the website over the last shot, no box. Set to leave
 * the picture readable behind it (the payoff, like the pizza cut into four,
 * stays the last thing seen), and the right side clear of the app's icons.
 */
function EndCardLayer({ card, width }: { card: EndCard; width: number }) {
  const frame = useCurrentFrame();
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
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingRight: `${(40 / 1080) * 100}%`, paddingBottom: "30%", opacity: appear, transform: `scale(${pop})` }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: (18 * width) / 1080, fontFamily: family, fontWeight: 400, color: "#fff", textAlign: "center", textShadow: "0 2px 24px rgba(0,0,0,0.55)" }}>
        {line(card.location.toUpperCase(), 92, 5)}
        {line(card.cta.toUpperCase(), 190, 7)}
        {line(card.site.toUpperCase(), 84, 5)}
      </div>
    </AbsoluteFill>
  );
}

/** A caption word settles in this many frames: from a little big and soft to sharp (measured on Noah's picks, 2026-11-12). */
const WORD_SETTLE_FRAMES = 5;
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
export function CaptionPage({ page, style, fontFamily, emphasis }: { page: TikTokPage; style: EdlStyle; fontFamily: string; /** normalised words to colour, one a line at most (lib/clipper/emphasis.ts) */ emphasis?: string[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nowMs = page.startMs + (frame / fps) * 1000;
  const spec = captionStyle(style.captions.preset);
  const base = captionLayout(style.captions);
  // One word at a time reads at half again the size.
  const l = spec.maxWords === 1 ? { ...base, fontSize: Math.round(base.fontSize * 1.5) } : base;
  const outline = style.textBox === "outline";
  const hi = style.captions.highlight;
  const vox = spec.id === "vox";
  // The page's entrance: a spring pop, a short rise, a fade, or nothing.
  const enter = spring({ frame, fps, config: { damping: 14, stiffness: 220, mass: 0.6 }, durationInFrames: 10 });
  const pageStyle: React.CSSProperties =
    spec.animation === "pop" ? { transform: `scale(${interpolate(enter, [0, 1], [0.6, 1])})`, opacity: Math.min(1, frame / 2) }
    : spec.animation === "rise" ? { transform: `translateY(${interpolate(enter, [0, 1], [18, 0])}px)`, opacity: Math.min(1, frame / 3) }
    : spec.animation === "fade" ? { opacity: Math.min(1, frame / 4) }
    : {};
  const stroke = outline && !style.captions.box ? { fontWeight: outlineWeight(style.font), WebkitTextStroke: `${Math.max(9, Math.round(l.fontSize * 0.18))}px #000`, paintOrder: "stroke fill" as const } : {};
  const tokens = page.tokens.filter((t) => t.text.trim());
  // The key word of the line (a marked word, else a number) keeps the highlight colour the whole time the page is up.
  const keyWord = emphasis?.length ? emphasisIndex(tokens.map((t) => t.text), emphasis) : -1;
  const wordColor = (i: number, fallback: string) => (i === keyWord ? hi : fallback);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center" }}>
      <div style={{ position: "absolute", ...(l.top ? { top: l.top } : { bottom: l.bottom! }), left: vox ? "8%" : "6%", right: vox ? "14%" : "6%", textAlign: vox ? "left" : "center", ...pageStyle }}>
        <span
          style={{
            display: "inline-block", fontFamily, fontWeight: outlineWeight(style.font) === 400 ? 400 : 700, fontSize: l.fontSize, lineHeight: vox ? 1.35 : 1.2, whiteSpace: "pre-wrap",
            textTransform: style.captions.uppercase ? "uppercase" : "none",
            padding: "10px 18px", borderRadius: 16, backgroundColor: style.captions.box ? "rgba(0,0,0,0.42)" : "transparent",
            textShadow: style.captions.box || outline ? "none" : "0 2px 14px rgba(0,0,0,0.8)",
            ...stroke,
          }}
        >
          {tokens.map((t, i) => {
            const active = t.fromMs <= nowMs && t.toMs > nowMs;
            const spoken = t.toMs <= nowMs;
            // How far the marker or fill has swept across this word, 0..1.
            const sweep = active ? Math.min(1, Math.max(0, (nowMs - t.fromMs) / Math.max(80, t.toMs - t.fromMs))) : spoken ? 1 : 0;
            const text = i === 0 ? t.text.trimStart() : t.text;
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
function SegmentLayer({ s, into, out, effects, softenFrom, children }: {
  s: TimelineSegment; into: TransitionKind | undefined; out: TransitionKind | undefined; effects: Effects | undefined;
  /** The frame of this cut where it softens behind the ending, when it is the last one and the cut has an ending card. */
  softenFrom?: number;
  children: (p: { effects: Effects | undefined; frame: number }) => React.ReactNode;
}) {
  const f = useCurrentFrame();
  const soft = softenFrom == null ? 0 : interpolate(f, [softenFrom, softenFrom + END_SOFTEN_FRAMES], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const look = transitionLook({ frame: f, frames: s.durationFrames, into, overlapIn: s.overlapIn, out, overlapOut: s.overlapOut });
  // Punch-ins: a continuous take steps in and back out where it would have cut (lib/studioClips/punch.ts).
  const punch = s.punches?.length ? punchScaleAt(s, s.in + f / FPS) : 1;
  const fx: Effects = [...(effects ?? [])];
  if (look.zoomBlur > 0.5) fx.push(zoomBlur({ amount: look.zoomBlur, samples: 16 }));
  if (look.blur > 0.5) fx.push(blur({ radius: look.blur, vertical: look.whip ? false : true }));
  // Behind the ending the picture stays sharp (its last shot is the payoff); only the bottom darkens for the words.
  return (
    <AbsoluteFill style={{ opacity: look.opacity, transform: look.scale !== 1 || look.x !== 0 || punch !== 1 ? `translateX(${look.x}%) scale(${look.scale * punch})` : undefined, transformOrigin: "50% 45%" }}>
      {children({ effects: fx.length ? fx : undefined, frame: f })}
      {look.flash > 0 ? <AbsoluteFill style={{ background: "#fff", opacity: look.flash, pointerEvents: "none" }} /> : null}
      {soft > 0 && <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.25) 45%, rgba(0,0,0,0) 70%)", opacity: soft }} />}
    </AbsoluteFill>
  );
}

export const ClipComposition: React.FC<ClipCompositionProps> = ({ edl, sources, captionsOn, ranking, captionWords, emphasis, finishOn, musicUrl, voiceUrls, cleanAudio, safeZoneGuide }) => {
  const { fps, width, height } = useVideoConfig();
  const style = edl.style ?? DEFAULT_STYLE;
  const fontFamily = useMemo(() => familyFor(style.font), [style.font]);
  // Shots that change during the cut (the AI Clipper): the picture for this frame on its path.
  const pathBox = (s: { clipId: string; frame?: SegmentFrame }, local: number) => {
    const src = sources[s.clipId];
    if (ranking && src?.width && src?.height) return rankingBox(src.width, src.height, width, height, ranking.items.length, s.frame?.path ? viewAt(s.frame.path, local / FPS).c : 0.5);
    return s.frame?.path && src?.width && src?.height ? viewBox(src.width, src.height, width, height, viewAt(s.frame.path, local / FPS)) : null;
  };
  const box = (s: { clipId: string; frame?: { zoom: number; x: number; y: number } }) => videoBox(sources[s.clipId]?.width ?? null, sources[s.clipId]?.height ?? null, width, height, s.frame);
  const tl = useMemo(() => timeline(edl), [edl]);
  // Measured balance, expressed as attenuation so no clip is pushed above unity.
  const maxGain = useMemo(() => Math.max(0, ...tl.segments.map((s) => s.gainDb)), [tl]);
  const words = useMemo(() => Object.fromEntries(Object.values(sources).map((s) => [s.clipId, s.words])), [sources]);
  // With a soundtrack, the clips' own sound plays at the level the person chose for it.
  const music = edl.soundtrack && musicUrl ? edl.soundtrack : null;
  const original = music ? music.originalVolume : 1;
  const finish = finishOn === false ? undefined : edl.finish;
  const card = edl.endCard ?? null;
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
  const cardFrom = edl.endCard ? tl.durationFrames - END_FRAMES + END_SOFTEN_FRAMES : Infinity;
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
              <SegmentLayer s={s} into={i ? s.transition : undefined} out={next?.transition} effects={effects[s.clipId]} softenFrom={card && !next ? Math.max(0, s.durationFrames - END_FRAMES) : undefined}>
                {({ effects: fx, frame: local }) => (
                  <Video
                    src={src.url}
                    trimBefore={s.inFrame}
                    durationInFrames={s.durationFrames}
                    effects={fx}
                    // Cleanup on: the measured gain curve (it may lift quiet sound; its peaks were measured
                    // to stay under -1 dBFS). Off: the Phase B balance, as attenuation only. Sound crossfades
                    // with the picture through a transition.
                    // With the noise reduced, the clip's own sound is replaced by the cleaned track below.
                    volume={cleaned ? 0 : level}
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
          <TextLayer line={t} width={width} height={height} font={style.font} textBox={style.textBox} accent={style.accent} />
        </Sequence>
      ))}
      {ranking && <RankingLayer ranking={ranking} fontFamily={fontFamily} />}
      {pages.map((p, i) => (
        <Sequence key={`c${i}`} from={p.from} durationInFrames={p.durationInFrames} name="captions">
          <CaptionPage page={p.page} style={style} fontFamily={fontFamily} emphasis={emphasis ?? edl.emphasis} />
        </Sequence>
      ))}
      {card && (
        <Sequence from={Math.max(0, tl.durationFrames - END_FRAMES + END_SOFTEN_FRAMES)} premountFor={PREMOUNT_FRAMES} name="ending">
          <EndCardLayer card={card} width={width} />
        </Sequence>
      )}
      {safeZoneGuide && <SafeZoneLayer width={width} height={height} />}
    </AbsoluteFill>
  );
};
