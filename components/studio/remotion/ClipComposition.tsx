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
import { AbsoluteFill, Img, Sequence, continueRender, delayRender, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
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
import { DEFAULT_STYLE, captionLayout, type EdlStyle, type FontId } from "@/lib/studioClips/style";
import { presetOf, safeZoneFor } from "@/lib/textPresets";
import { renderTextLayer } from "@/lib/textRender";
import type { TikTokPage } from "@remotion/captions";
import type { BuildSource, Edl, EdlText } from "@/lib/studioClips/types";
import { timeline, captionPages, dbToGain, edgeEnvelope, secToFrames, videoBox, FPS, type TimelineSegment } from "@/lib/studioClips/timeline";
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
  /** draw the text safe zone over the picture (preview check only; the export never sets it) */
  safeZoneGuide?: boolean;
};

/** The soundtrack fades in over 0.2 s and out over the last 0.8 s, so it never starts or stops abruptly. */
const MUSIC_FADE_IN = 6, MUSIC_FADE_OUT = 24;

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
function TextLayer({ line, width, height, font }: { line: EdlText; width: number; height: number; font: FontId }) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const preset = presetOf(line);
  const args = useMemo(() => ({ presetId: preset.id, text: line.text, slot: line.slot, width, height, font }), [preset.id, line.text, line.slot, width, height, font]);
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

export const ClipComposition: React.FC<ClipCompositionProps> = ({ edl, sources, captionsOn, finishOn, musicUrl, cleanAudio, safeZoneGuide }) => {
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
  const pages = useMemo(() => (captionsOn ? captionPages(edl, words, fps) : []), [edl, words, captionsOn, fps]);

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
          // premountFor: the Player loads the next shot before it is on screen. Without it the shot started
          // loading as the transition began, so it arrived late and the join stuttered. A render ignores it.
          <Sequence key={s.id} from={s.startFrame} durationInFrames={s.durationFrames} premountFor={PREMOUNT_FRAMES} name={`${s.role} · clip ${src.position + 1}`}>
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
      {edl.text.filter((t) => t.text.trim()).map((t) => (
        <Sequence key={t.id} from={secToFrames(t.at)} durationInFrames={Math.max(1, secToFrames(t.end - t.at))} name={`text · ${presetOf(t).label}`}>
          <TextLayer line={t} width={width} height={height} font={style.font} />
        </Sequence>
      ))}
      {pages.map((p, i) => (
        <Sequence key={`c${i}`} from={p.from} durationInFrames={p.durationInFrames} name="captions">
          <CaptionPage page={p.page} style={style} fontFamily={fontFamily} />
        </Sequence>
      ))}
      {safeZoneGuide && <SafeZoneLayer width={width} height={height} />}
    </AbsoluteFill>
  );
};
