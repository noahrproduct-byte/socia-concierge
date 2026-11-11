// Pieces shared by the animated templates (CompareScene, CounterScene), drawn
// to the timing from the reference study: headlines that swap hard with ~100 ms
// of blur, a comment question at the end, one brighten at the payoff.
import { AbsoluteFill, Easing, Sequence, interpolate, useCurrentFrame } from "remotion";
import { Audio } from "@remotion/media";
import { loadFont as loadSans } from "@remotion/google-fonts/Inter";
import { loadFont as loadSerif } from "@remotion/google-fonts/InstrumentSerif";
import type { CompareHeadline } from "@/lib/animated/spec";

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

export type TemplateColors = { bg: string; fg: string; dim: string; accent: string; light: boolean };

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

/** The one climax effect: a short brighten starting at `atFrame`. */
export function Flash({ atFrame, colors }: { atFrame: number; colors: TemplateColors }) {
  const f = useCurrentFrame() - atFrame;
  const o = f >= 0 && f < 8 ? interpolate(f, [0, 2, 8], [0, colors.light ? 0.1 : 0.14, 0]) : 0;
  return <AbsoluteFill style={{ background: colors.light ? "#FFFFFF" : "#FFF6E8", opacity: o, pointerEvents: "none" }} />;
}
