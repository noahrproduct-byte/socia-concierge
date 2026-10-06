"use client";

// The post as video: the EDL rendered by Remotion, identical in the Player
// (preview) and in the browser render (export). Nothing here is invented at
// render time — segments, text lines, measured gain and transcript captions
// all come from the validated EDL. Styles stay inside the client-side
// renderer's supported subset (no filters, no backdrop effects).
import React, { useMemo } from "react";
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Video } from "@remotion/media";
import { loadFont } from "@remotion/google-fonts/Inter";
import { createTikTokStyleCaptions, type TikTokPage } from "@remotion/captions";
import type { BuildSource, Edl, EdlText } from "@/lib/studioClips/types";
import { timeline, captionsForEdl, dbToGain, edgeEnvelope, secToFrames } from "@/lib/studioClips/timeline";

const { fontFamily } = loadFont("normal", { weights: ["600", "700"], subsets: ["latin"] });

export type ClipCompositionProps = {
  edl: Edl;
  sources: Record<string, BuildSource>;
  captionsOn: boolean;
};

/** Captions page every ~1.2 s, like short-form captions people are used to. */
const CAPTION_PAGE_MS = 1200;

const TEXT_STYLE: Record<EdlText["role"], { top: string; size: number }> = {
  opening: { top: "17%", size: 66 },
  mid: { top: "60%", size: 52 },
  cta: { top: "73%", size: 56 },
};

function TextLayer({ text, role }: { text: string; role: EdlText["role"] }) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const inF = Math.round(fps * 0.25);
  const appear = interpolate(frame, [0, inF], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const leave = interpolate(frame, [durationInFrames - inF, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const o = Math.min(appear, leave);
  const s = TEXT_STYLE[role];
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
            fontFamily, fontWeight: 700, fontSize: s.size, lineHeight: 1.15, color: "#fff", textAlign: "center",
            whiteSpace: "pre-wrap", padding: "18px 28px", borderRadius: 24,
            backgroundColor: role === "cta" ? "rgba(91, 75, 214, 0.86)" : "rgba(0, 0, 0, 0.46)",
            textShadow: "0 2px 12px rgba(0,0,0,0.45)",
          }}
        >
          {text}
        </div>
      </div>
    </AbsoluteFill>
  );
}

function CaptionPage({ page }: { page: TikTokPage }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nowMs = page.startMs + (frame / fps) * 1000;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center" }}>
      <div style={{ position: "absolute", bottom: "27%", left: "6%", right: "6%", textAlign: "center" }}>
        <span
          style={{
            display: "inline-block", fontFamily, fontWeight: 700, fontSize: 54, lineHeight: 1.2, whiteSpace: "pre-wrap",
            padding: "10px 18px", borderRadius: 16, backgroundColor: "rgba(0,0,0,0.42)", textShadow: "0 2px 10px rgba(0,0,0,0.5)",
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

export const ClipComposition: React.FC<ClipCompositionProps> = ({ edl, sources, captionsOn }) => {
  const { fps } = useVideoConfig();
  const tl = useMemo(() => timeline(edl), [edl]);
  // Measured balance, expressed as attenuation so no clip is pushed above unity.
  const maxGain = useMemo(() => Math.max(0, ...tl.segments.map((s) => s.gainDb)), [tl]);
  const words = useMemo(() => Object.fromEntries(Object.values(sources).map((s) => [s.clipId, s.words])), [sources]);
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
        return (
          <Sequence key={s.id} from={s.startFrame} durationInFrames={s.durationFrames} name={`${s.role} · clip ${src.position + 1}`}>
            <Video
              src={src.url}
              trimBefore={s.inFrame}
              durationInFrames={s.durationFrames}
              volume={(f) => Math.min(1, gain * edgeEnvelope(f, s.durationFrames))}
              // Fill the vertical frame; landscape footage is cropped at the sides, never letterboxed.
              objectFit="cover"
              style={{ width: "100%", height: "100%" }}
            />
          </Sequence>
        );
      })}
      {edl.text.map((t) => (
        <Sequence key={t.id} from={secToFrames(t.at)} durationInFrames={Math.max(1, secToFrames(t.end - t.at))} name={`text · ${t.role}`}>
          <TextLayer text={t.text} role={t.role} />
        </Sequence>
      ))}
      {pages.map((page, i) => {
        const start = Math.round((page.startMs / 1000) * fps);
        const next = pages[i + 1];
        const end = Math.min(next ? Math.round((next.startMs / 1000) * fps) : tl.durationFrames, start + Math.round((CAPTION_PAGE_MS / 1000) * fps));
        if (end - start <= 0) return null;
        return (
          <Sequence key={`c${i}`} from={start} durationInFrames={end - start} name="captions">
            <CaptionPage page={page} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
