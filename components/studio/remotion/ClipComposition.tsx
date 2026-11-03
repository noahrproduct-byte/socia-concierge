"use client";

// The post as video: the EDL rendered by Remotion, identical in the Player
// (preview) and in the browser render (export). Nothing here is invented at
// render time — segments, text lines, measured gain and transcript captions
// all come from the validated EDL. Styles stay inside the client-side
// renderer's supported subset (no CSS filters, no backdrop effects); picture
// corrections use @remotion/effects' colorCorrection(), a WebGL pass that
// the Player, the browser render and Safari all support.
import React, { useMemo } from "react";
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
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
import { DEFAULT_STYLE, captionLayout, textColors, type EdlStyle, type FontId } from "@/lib/studioClips/style";
import { createTikTokStyleCaptions, type TikTokPage } from "@remotion/captions";
import type { BuildSource, Edl, EdlText } from "@/lib/studioClips/types";
import { timeline, captionsForEdl, dbToGain, edgeEnvelope, secToFrames, videoBox, FPS, type TimelineSegment } from "@/lib/studioClips/timeline";
import { transitionLook, transitionSound } from "@/lib/studioClips/transitions";
import type { TransitionKind } from "@/lib/studioClips/types";
import { gainAtDb } from "@/lib/studioClips/sound";

// Inter is the default and loads at once; the others load only when an edit uses them.
const { fontFamily: interFamily } = loadInter("normal", { weights: ["600", "700"], subsets: ["latin"] });
const FONT_LOADERS: Record<FontId, () => string> = {
  inter: () => interFamily,
  montserrat: () => loadMontserrat("normal", { weights: ["600", "700", "800"], subsets: ["latin"] }).fontFamily,
  tiktok: () => loadTikTok("normal", { weights: ["700", "800"], subsets: ["latin"] }).fontFamily,
  anton: () => loadAnton("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily,
  poppins: () => loadPoppins("normal", { weights: ["600", "700"], subsets: ["latin"] }).fontFamily,
  playfair: () => loadPlayfair("normal", { weights: ["600", "700"], subsets: ["latin"] }).fontFamily,
  bebas: () => loadBebas("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily,
};
const loaded = new Map<FontId, string>();
const familyFor = (id: FontId) => { if (!loaded.has(id)) loaded.set(id, FONT_LOADERS[id]()); return loaded.get(id)!; };

export type ClipCompositionProps = {
  edl: Edl;
  sources: Record<string, BuildSource>;
  captionsOn: boolean;
  /** false shows the cut without the measured corrections (Before); omitted = After */
  finishOn?: boolean;
  /** a playable link to the cut's soundtrack (edl.soundtrack), when it has one */
  musicUrl?: string | null;
  /** each clip's sound with the background noise reduced (lib/studioClips/cleanSound.ts), played instead of its own when edl.cleanSound is on */
  cleanAudio?: Record<string, string>;
};

/** The soundtrack fades in over 0.2 s and out over the last 0.8 s, so it never starts or stops abruptly. */
const MUSIC_FADE_IN = 6, MUSIC_FADE_OUT = 24;

/** Captions page every ~1.2 s, like short-form captions people are used to. */
const CAPTION_PAGE_MS = 1200;

const TEXT_STYLE: Record<EdlText["role"], { top: string; size: number }> = {
  opening: { top: "17%", size: 66 },
  mid: { top: "60%", size: 52 },
  cta: { top: "73%", size: 56 },
};

const SIZE_SCALE = { s: 0.8, m: 1, l: 1.2 } as const;

/** Heavier type for the outline look: a thin weight disappears inside its outline. */
const outlineWeight = (font: EdlStyle["font"]) => (font === "anton" || font === "bebas" ? 400 : 800);

function TextLayer({ text, role, size = "m", style, fontFamily }: { text: string; role: EdlText["role"]; size?: EdlText["size"]; style: EdlStyle; fontFamily: string }) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const inF = Math.round(fps * 0.25);
  const appear = interpolate(frame, [0, inF], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const leave = interpolate(frame, [durationInFrames - inF, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const o = Math.min(appear, leave);
  const s = TEXT_STYLE[role];
  const c = textColors(style, role);
  if (c.stroke) {
    // CapCut Classic: pops in with a small overshoot, white with an outline, no box.
    const pop = interpolate(frame, [0, 5, 9], [0.55, 1.07, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    // Every line reads at headline size in this look; the outline sits behind the letters, so half its width shows.
    const fontSize = Math.round(Math.max(s.size, 64) * 1.12 * SIZE_SCALE[size ?? "m"]);
    return (
      <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center" }}>
        <div style={{ position: "absolute", top: s.top, left: "6%", right: "6%", display: "flex", justifyContent: "center", opacity: Math.min(interpolate(frame, [0, 3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), leave), transform: `scale(${pop})` }}>
          <div
            style={{
              fontFamily, fontWeight: outlineWeight(style.font), fontSize, lineHeight: 1.12, letterSpacing: "-0.01em", color: c.fg, textAlign: "center",
              whiteSpace: "pre-wrap", textWrap: "balance", WebkitTextStroke: `${Math.max(10, Math.round(fontSize * 0.2))}px ${c.stroke}`, paintOrder: "stroke fill",
            }}
          >
            {text}
          </div>
        </div>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center" }}>
      <div
        style={{
          position: "absolute", top: s.top, left: "7%", right: "7%", display: "flex", justifyContent: "center",
          opacity: o, transform: `translateY(${(1 - appear) * 18}px)`,
        }}
      >
        <div
          style={{
            fontFamily, fontWeight: 700, fontSize: Math.round(s.size * SIZE_SCALE[size ?? "m"]), lineHeight: 1.15, color: c.fg, textAlign: "center",
            whiteSpace: "pre-wrap", padding: "18px 28px", borderRadius: 24,
            backgroundColor: c.bg ?? "transparent",
            textShadow: c.shadow,
          }}
        >
          {text}
        </div>
      </div>
    </AbsoluteFill>
  );
}

function CaptionPage({ page, style, fontFamily }: { page: TikTokPage; style: EdlStyle; fontFamily: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nowMs = page.startMs + (frame / fps) * 1000;
  const l = captionLayout(style.captions);
  const outline = style.textBox === "outline";
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center" }}>
      <div style={{ position: "absolute", ...(l.top ? { top: l.top } : { bottom: l.bottom! }), left: "6%", right: "6%", textAlign: "center" }}>
        <span
          style={{
            display: "inline-block", fontFamily, fontWeight: 700, fontSize: l.fontSize, lineHeight: 1.2, whiteSpace: "pre-wrap",
            textTransform: style.captions.uppercase ? "uppercase" : "none",
            padding: "10px 18px", borderRadius: 16, backgroundColor: style.captions.box ? "rgba(0,0,0,0.42)" : "transparent",
            textShadow: style.captions.box || outline ? "none" : "0 2px 14px rgba(0,0,0,0.8)",
            ...(outline && !style.captions.box ? { fontWeight: outlineWeight(style.font), WebkitTextStroke: `${Math.max(9, Math.round(l.fontSize * 0.18))}px #000`, paintOrder: "stroke fill" } : {}),
          }}
        >
          {page.tokens.map((t, i) => {
            const active = t.fromMs <= nowMs && t.toMs > nowMs;
            return <span key={`${t.fromMs}-${i}`} style={{ color: active ? "#fff" : "rgba(255,255,255,0.72)" }}>{t.text}</span>;
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
function SegmentLayer({ s, into, out, effects, children }: {
  s: TimelineSegment; into: TransitionKind | undefined; out: TransitionKind | undefined; effects: Effects | undefined;
  children: (p: { effects: Effects | undefined }) => React.ReactNode;
}) {
  const f = useCurrentFrame();
  const look = transitionLook({ frame: f, frames: s.durationFrames, into, overlapIn: s.overlapIn, out, overlapOut: s.overlapOut });
  const fx: Effects = [...(effects ?? [])];
  if (look.zoomBlur > 0.5) fx.push(zoomBlur({ amount: look.zoomBlur, samples: 16 }));
  if (look.blur > 0.5) fx.push(blur({ radius: look.blur, vertical: look.whip ? false : true }));
  return (
    <AbsoluteFill style={{ opacity: look.opacity, transform: look.scale !== 1 || look.x !== 0 ? `translateX(${look.x}%) scale(${look.scale})` : undefined }}>
      {children({ effects: fx.length ? fx : undefined })}
    </AbsoluteFill>
  );
}

export const ClipComposition: React.FC<ClipCompositionProps> = ({ edl, sources, captionsOn, finishOn, musicUrl, cleanAudio }) => {
  const { fps, width, height } = useVideoConfig();
  const style = edl.style ?? DEFAULT_STYLE;
  const fontFamily = useMemo(() => familyFor(style.font), [style.font]);
  const box = (s: { clipId: string; frame?: { zoom: number; x: number; y: number } }) => videoBox(sources[s.clipId]?.width ?? null, sources[s.clipId]?.height ?? null, width, height, s.frame);
  const tl = useMemo(() => timeline(edl), [edl]);
  // Measured balance, expressed as attenuation so no clip is pushed above unity.
  const maxGain = useMemo(() => Math.max(0, ...tl.segments.map((s) => s.gainDb)), [tl]);
  const words = useMemo(() => Object.fromEntries(Object.values(sources).map((s) => [s.clipId, s.words])), [sources]);
  // With a soundtrack, the clips' own sound plays at the level the person chose for it.
  const music = edl.soundtrack && musicUrl ? edl.soundtrack : null;
  const original = music ? music.originalVolume : 1;
  const finish = finishOn === false ? undefined : edl.finish;
  // One effect instance per graded clip, so the WebGL program isn't rebuilt every frame.
  const effects = useMemo(() => {
    if (!finish || finish.look === "off") return {} as Record<string, ReturnType<typeof colorCorrection>[]>;
    return Object.fromEntries(Object.entries(finish.grades).map(([id, g]) => [id, [colorCorrection(g.params)]]));
  }, [finish]);
  const pages = useMemo(() => {
    if (!captionsOn || !edl.captions) return [] as TikTokPage[];
    const captions = captionsForEdl(edl, words);
    return captions.length ? createTikTokStyleCaptions({ captions, combineTokensWithinMilliseconds: CAPTION_PAGE_MS }).pages : [];
  }, [edl, words, captionsOn]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", fontFamily }}>
      {tl.segments.map((s, i) => {
        const src = sources[s.clipId];
        if (!src) return null;
        const gain = dbToGain(s.gainDb - maxGain);
        const sound = finish?.sound ? finish.sounds[s.clipId] : undefined;
        const next = tl.segments[i + 1];
        const cleaned = edl.cleanSound ? cleanAudio?.[s.clipId] : undefined;
        const level = (f: number) => (sound ? dbToGain(gainAtDb(sound, s.in + f / FPS)) : Math.min(1, gain)) * edgeEnvelope(f, s.durationFrames) * (s.volume ?? 1) * original * transitionSound(f, s.durationFrames, s.overlapIn, s.overlapOut);
        return (
          <Sequence key={s.id} from={s.startFrame} durationInFrames={s.durationFrames} name={`${s.role} · clip ${src.position + 1}`}>
            <SegmentLayer s={s} into={i ? s.transition : undefined} out={next?.transition} effects={effects[s.clipId]}>
              {({ effects: fx }) => (
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
                  style={box(s) ?? { width: "100%", height: "100%" }}
                />
              )}
            </SegmentLayer>
            {cleaned && <Audio src={cleaned} trimBefore={s.inFrame} durationInFrames={s.durationFrames} volume={level} />}
          </Sequence>
        );
      })}
      {music && (
        <Sequence from={0} durationInFrames={tl.durationFrames} name="soundtrack">
          <Audio
            src={musicUrl!}
            volume={(f) => music.musicVolume * Math.min(1, f / MUSIC_FADE_IN, (tl.durationFrames - f) / MUSIC_FADE_OUT)}
          />
        </Sequence>
      )}
      {edl.text.map((t) => (
        <Sequence key={t.id} from={secToFrames(t.at)} durationInFrames={Math.max(1, secToFrames(t.end - t.at))} name={`text · ${t.role}`}>
          <TextLayer text={t.text} role={t.role} size={t.size} style={style} fontFamily={fontFamily} />
        </Sequence>
      ))}
      {pages.map((page, i) => {
        const start = Math.round((page.startMs / 1000) * fps);
        const next = pages[i + 1];
        const end = Math.min(next ? Math.round((next.startMs / 1000) * fps) : tl.durationFrames, start + Math.round((CAPTION_PAGE_MS / 1000) * fps));
        if (end - start <= 0) return null;
        return (
          <Sequence key={`c${i}`} from={start} durationInFrames={end - start} name="captions">
            <CaptionPage page={page} style={style} fontFamily={fontFamily} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
