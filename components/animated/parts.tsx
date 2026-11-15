// Pieces shared by the animated templates (CompareScene, CounterScene), drawn
// to the timing from the reference study: headlines that swap hard with ~100 ms
// of blur, a comment question at the end, one brighten at the payoff.
import { AbsoluteFill, Easing, Sequence, interpolate, useCurrentFrame } from "remotion";
import { Audio } from "@remotion/media";
import { loadFont as loadSans } from "@remotion/google-fonts/Inter";
import { loadFont as loadSerif } from "@remotion/google-fonts/InstrumentSerif";
import { loadFont as loadCondensed } from "@remotion/google-fonts/Oswald";
import { loadFont as loadDisplaySerif } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadRounded } from "@remotion/google-fonts/Nunito";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as loadHand } from "@remotion/google-fonts/Caveat";
import type { CompareHeadline } from "@/lib/animated/spec";
import type { AnimatedLook } from "@/lib/animated/look";
import type { FontId } from "@/lib/videoStyle";

/**
 * The sound effects, all synthesised by scripts/animated-sfx.py (nothing to
 * license): ticks that follow the counting curves, a stamp thud, a whoosh on
 * each headline swap, a hit at the payoff, a pop and comment-box typing.
 */
export type SfxName = "stamp" | "whoosh" | "hit" | "pop" | "typing" | "compare-run" | `round-${string}`;
export type SfxCue = { at: number; name: SfxName; volume: number; frames?: number };

/** A counter round's tick track: one file per round length in ROUND_SECONDS. */
export const roundSfx = (seconds: number): SfxName => `round-${String(seconds).replace(".", "_")}`;

/** Plays each cue from its frame. A handful of files per video, never one per tick. */
export function SoundTrack({ cues }: { cues: SfxCue[] }) {
  return (
    <>
      {cues.map((c, i) => (
        <Sequence key={i} from={Math.max(0, Math.round(c.at))} durationInFrames={c.frames} layout="none">
          <Audio src={`/animated/sfx/${c.name}.mp3`} volume={c.volume} />
        </Sequence>
      ))}
    </>
  );
}

export const { fontFamily: SANS } = loadSans("normal", { weights: ["500", "700", "800"], subsets: ["latin"] });
export const { fontFamily: SERIF } = loadSerif("italic", { subsets: ["latin"] });

const { fontFamily: CONDENSED } = loadCondensed("normal", { weights: ["600", "700"], subsets: ["latin"] });
const { fontFamily: DISPLAY_SERIF } = loadDisplaySerif("normal", { weights: ["700"], subsets: ["latin"] });
const { fontFamily: ROUNDED } = loadRounded("normal", { weights: ["700", "800"], subsets: ["latin"] });
export const { fontFamily: MONO } = loadMono("normal", { weights: ["500", "700"], subsets: ["latin"] });
const { fontFamily: HAND } = loadHand("normal", { weights: ["700"], subsets: ["latin"] });

/** The family for an account's type (lib/videoStyle.ts FontId). */
export const fontFor = (f: FontId | undefined): string =>
  f === "condensed" ? CONDENSED : f === "serif" ? DISPLAY_SERIF : f === "rounded" ? ROUNDED : f === "mono" ? MONO : f === "handwritten" ? HAND : SANS;

/** The template's colours; `look` is the account's own look when it has a video style. */
export type TemplateColors = { bg: string; fg: string; dim: string; accent: string; light: boolean; look?: AnimatedLook | null };

/** State colours: the winner green, a bad result red, finished or neutral grey. */
export const TONES = {
  dark: { win: "#8BCB8E", lose: "#E8634F", neutral: "#7A7069" },
  light: { win: "#2F8A4E", lose: "#CC3F2C", neutral: "#9A928A" },
} as const;

export const surfaceOf = (c: TemplateColors) => (c.light ? "rgba(20,20,20,0.06)" : "rgba(255,255,255,0.06)");
export const lineOf = (c: TemplateColors) => (c.light ? "rgba(20,20,20,0.16)" : "rgba(255,255,255,0.16)");

/** 0 -> 1 over the 0.4 s after `at` seconds: lines that join at the end. */
export const interpolateEnd = (t: number, at: number) => interpolate(t, [at, at + 0.4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

/** Spring stamp: 100 -> 85 -> 110 -> 100 % over ~300 ms. */
export const stampScale = (f: number) => interpolate(f, [0, 3, 6, 9], [1, 0.85, 1.1, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

/** The headline in force at this frame. Swaps are hard: ~100 ms of blur and a small slide, never a cross-fade. */
export function SwapHeadline({ steps, colors, top = 170 }: { steps: { at: number; h: CompareHeadline }[]; colors: TemplateColors; top?: number }) {
  const frame = useCurrentFrame();
  const cur = [...steps].reverse().find((s) => frame >= s.at) ?? steps[0];
  const since = frame - cur.at;
  const blur = cur.at > 0 && since < 3 ? [8, 4, 1][since] : 0;
  const shift = cur.at > 0 && since < 3 ? [-18, -6, 0][since] : 0;
  const [a, b] = cur.h.lines;
  const look = colors.look;
  if (look) {
    // The account's own headline: its type family and case, the second line in its key colour.
    // Sized so the longest line fits on one line across the frame (two lines, never three).
    const longest = Math.max(a.length, b.length, 8);
    const perChar = look.font === "condensed" ? 0.5 : 0.56;
    const big = Math.round(Math.min(look.font === "condensed" ? 104 : 80, 940 / (longest * perChar)));
    const style = { fontFamily: fontFor(look.font), fontWeight: 700, fontSize: big, lineHeight: 1.02, letterSpacing: look.font === "condensed" ? 0.5 : -1, textTransform: look.upper ? "uppercase" : "none" } as const;
    return (
      <div style={{ position: "absolute", left: 70, right: 70, top, textAlign: "left", filter: `blur(${blur}px)`, transform: `translateX(${shift}px)` }}>
        <div style={{ ...style, color: look.fg }}>{a}</div>
        <div style={{ ...style, color: look.key }}>{b}</div>
      </div>
    );
  }
  const i = cur.h.key ? b.toLowerCase().indexOf(cur.h.key.toLowerCase()) : -1;
  const line = { fontFamily: SANS, fontWeight: 800, fontSize: 68, lineHeight: 1.08, letterSpacing: -1.5, color: colors.fg } as const;
  return (
    <div style={{ position: "absolute", left: 70, right: 70, top, textAlign: "center", filter: `blur(${blur}px)`, transform: `translateX(${shift}px)` }}>
      <div style={line}>{a}</div>
      <div style={line}>
        {i < 0 ? b : (
          <>
            {b.slice(0, i)}
            <span style={{ fontFamily: SERIF, fontStyle: "italic", fontWeight: 400, fontSize: 84, color: colors.accent }}>{b.slice(i, i + cur.h.key.length)}</span>
            {b.slice(i + cur.h.key.length)}
          </>
        )}
      </div>
    </div>
  );
}

/** The comment question at the end, with a comment box that slides up and, when given an answer, types it. */
export function CommentPrompt({ question, startFrame, answer, colors, top = 1600 }: { question: string; startFrame: number; answer?: string; colors: TemplateColors; top?: number }) {
  const frame = useCurrentFrame();
  const qF = frame - startFrame;
  if (!question || qF < 0) return null;
  const p = interpolate(qF, [0, 9], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const typed = answer ? answer.slice(0, Math.max(0, Math.floor((qF - 18) / 2))) : "";
  const caret = Math.floor(frame / 15) % 2 === 0 ? "|" : " ";
  return (
    <div style={{ position: "absolute", left: 90, right: 90, top: top + (1 - p) * 40, opacity: p, fontFamily: SANS }}>
      <div style={{ fontWeight: 700, fontSize: 38, color: colors.fg, marginBottom: 18, textAlign: "center" }}>{question}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "20px 26px", borderRadius: 40, background: surfaceOf(colors), border: `2px solid ${lineOf(colors)}` }}>
        <div style={{ width: 52, height: 52, borderRadius: 26, background: lineOf(colors), flex: "none" }} />
        <div style={{ flex: 1, fontWeight: 500, fontSize: 36, color: typed ? colors.fg : colors.dim }}>{typed ? typed + caret : `Add a comment…${answer ? "" : caret}`}</div>
        <div style={{ fontWeight: 700, fontSize: 34, color: colors.accent, opacity: answer && typed.length === answer.length ? 1 : 0.45 }}>Post</div>
      </div>
    </div>
  );
}

/**
 * The ending that asks for the goal (spec.cta): one line naming what the brand
 * does, then its own call to action as a button, then its name. Replaces the
 * comment question when the video is meant to bring sign-ups, orders or bookings.
 */
export function CtaCard({ cta, brand, startFrame, colors, top = 1240 }: { cta: { line: string; action: string }; brand: string | null; startFrame: number; colors: TemplateColors; top?: number }) {
  const frame = useCurrentFrame();
  const f = frame - startFrame;
  if (f < 0) return null;
  const p = interpolate(f, [0, 10], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const b = interpolate(f, [8, 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const look = colors.look;
  const family = look ? fontFor(look.font) : SANS;
  return (
    <div style={{ position: "absolute", left: 50, right: 50, top: top + (1 - p) * 30, opacity: p, display: "flex", flexDirection: "column", alignItems: look ? "flex-start" : "center", gap: 22, textAlign: look ? "left" : "center", padding: look ? "28px 26px" : 0, borderRadius: 18, background: look ? colors.bg : "transparent" }}>
      <div style={{ fontFamily: family, fontWeight: 700, fontSize: look?.font === "condensed" ? 52 : 44, lineHeight: 1.12, color: colors.fg, textTransform: look?.upper ? "uppercase" : "none" }}>{cta.line}</div>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 16, padding: "18px 30px", borderRadius: 16, background: colors.accent, color: "#111111", fontFamily: family, fontWeight: 700, fontSize: 40, transform: `scale(${0.9 + 0.1 * b})`, opacity: b, textTransform: look?.upper ? "uppercase" : "none" }}>{cta.action}</div>
      {brand && <div style={{ fontFamily: look ? MONO : SANS, fontWeight: 600, fontSize: 28, color: colors.dim, letterSpacing: look ? 2 : 0, opacity: b }}>{brand}</div>}
    </div>
  );
}

/** The one climax effect: a short brighten starting at `atFrame`. */
export function Flash({ atFrame, colors }: { atFrame: number; colors: TemplateColors }) {
  const f = useCurrentFrame() - atFrame;
  const o = f >= 0 && f < 8 ? interpolate(f, [0, 2, 8], [0, colors.light ? 0.1 : 0.14, 0]) : 0;
  return <AbsoluteFill style={{ background: colors.light ? "#FFFFFF" : "#FFF6E8", opacity: o, pointerEvents: "none" }} />;
}
