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
import { Video } from "@remotion/media";
import { colorCorrection } from "@remotion/effects/color-correction";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadBebas } from "@remotion/google-fonts/BebasNeue";
import { DEFAULT_STYLE, captionLayout, textColors, type EdlStyle, type FontId } from "@/lib/studioClips/style";
import { createTikTokStyleCaptions, type TikTokPage } from "@remotion/captions";
import type { BuildSource, Edl, EdlText } from "@/lib/studioClips/types";
import { timeline, captionsForEdl, dbToGain, edgeEnvelope, secToFrames, videoBox, FPS } from "@/lib/studioClips/timeline";
import { gainAtDb } from "@/lib/studioClips/sound";

// Inter is the default and loads at once; the others load only when an edit uses them.
const { fontFamily: interFamily } = loadInter("normal", { weights: ["600", "700"], subsets: ["latin"] });
const FONT_LOADERS: Record<FontId, () => string> = {
  inter: () => interFamily,
  montserrat: () => loadMontserrat("normal", { weights: ["600", "700"], subsets: ["latin"] }).fontFamily,
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
};

/** Captions page every ~1.2 s, like short-form captions people are used to. */
const CAPTION_PAGE_MS = 1200;

const TEXT_STYLE: Record<EdlText["role"], { top: string; size: number }> = {
  opening: { top: "17%", size: 66 },
  mid: { top: "60%", size: 52 },
  cta: { top: "73%", size: 56 },
};

function TextLayer({ text, role, style, fontFamily }: { text: string; role: EdlText["role"]; style: EdlStyle; fontFamily: string }) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const inF = Math.round(fps * 0.25);
  const appear = interpolate(frame, [0, inF], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const leave = interpolate(frame, [durationInFrames - inF, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const o = Math.min(appear, leave);
  const s = TEXT_STYLE[role];
  const c = textColors(style, role);
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
            fontFamily, fontWeight: 700, fontSize: s.size, lineHeight: 1.15, color: c.fg, textAlign: "center",
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
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center" }}>
      <div style={{ position: "absolute", ...(l.top ? { top: l.top } : { bottom: l.bottom! }), left: "6%", right: "6%", textAlign: "center" }}>
        <span
          style={{
            display: "inline-block", fontFamily, fontWeight: 700, fontSize: l.fontSize, lineHeight: 1.2, whiteSpace: "pre-wrap",
            textTransform: style.captions.uppercase ? "uppercase" : "none",
            padding: "10px 18px", borderRadius: 16, backgroundColor: style.captions.box ? "rgba(0,0,0,0.42)" : "transparent",
            textShadow: style.captions.box ? "0 2px 10px rgba(0,0,0,0.5)" : "0 2px 14px rgba(0,0,0,0.8)",
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

export const ClipComposition: React.FC<ClipCompositionProps> = ({ edl, sources, captionsOn, finishOn }) => {
  const { fps, width, height } = useVideoConfig();
  const style = edl.style ?? DEFAULT_STYLE;
  const fontFamily = useMemo(() => familyFor(style.font), [style.font]);
  const box = (s: { clipId: string; frame?: { zoom: number; x: number; y: number } }) => videoBox(sources[s.clipId]?.width ?? null, sources[s.clipId]?.height ?? null, width, height, s.frame);
  const tl = useMemo(() => timeline(edl), [edl]);
  // Measured balance, expressed as attenuation so no clip is pushed above unity.
  const maxGain = useMemo(() => Math.max(0, ...tl.segments.map((s) => s.gainDb)), [tl]);
  const words = useMemo(() => Object.fromEntries(Object.values(sources).map((s) => [s.clipId, s.words])), [sources]);
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
      {tl.segments.map((s) => {
        const src = sources[s.clipId];
        if (!src) return null;
        const gain = dbToGain(s.gainDb - maxGain);
        const sound = finish?.sound ? finish.sounds[s.clipId] : undefined;
        return (
          <Sequence key={s.id} from={s.startFrame} durationInFrames={s.durationFrames} name={`${s.role} · clip ${src.position + 1}`}>
            <Video
              src={src.url}
              trimBefore={s.inFrame}
              durationInFrames={s.durationFrames}
              effects={effects[s.clipId]}
              // Cleanup on: the measured gain curve (it may lift quiet sound; its peaks were measured
              // to stay under -1 dBFS). Off: the Phase B balance, as attenuation only.
              volume={(f) => (sound ? dbToGain(gainAtDb(sound, s.in + f / FPS)) : Math.min(1, gain)) * edgeEnvelope(f, s.durationFrames) * (s.volume ?? 1)}
              // Cover the frame, never letterboxed: sized to the footage's own aspect and the
              // person's reframe (videoBox), or centred cover when the size isn't known.
              objectFit={box(s) ? "fill" : "cover"}
              style={box(s) ?? { width: "100%", height: "100%" }}
            />
          </Sequence>
        );
      })}
      {edl.text.map((t) => (
        <Sequence key={t.id} from={secToFrames(t.at)} durationInFrames={Math.max(1, secToFrames(t.end - t.at))} name={`text · ${t.role}`}>
          <TextLayer text={t.text} role={t.role} style={style} fontFamily={fontFamily} />
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
