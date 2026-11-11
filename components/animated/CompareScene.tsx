// The comparison template of the animated style (AnimatedCompare in
// lib/animated/spec.ts), drawn to the timing taken from the reference Reels:
// one fixed frame that never cuts; columns that count up together, each
// stopping at its value, snapping to its colour and getting a spring stamp
// 200 ms later; the top value slows into its stop; headlines swap hard with a
// short blur; one brighten at the last stop; it ends on a comment question.
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { COMPARE_TIMES, compareCounter, compareStopAt, compareValueText, type AnimatedCompare, type CompareTone } from "@/lib/animated/spec";
import { CommentPrompt, Flash, SANS, SoundTrack, SwapHeadline, TONES, interpolateEnd, lineOf, stampScale, surfaceOf, type SfxCue, type TemplateColors } from "./parts";

export type CompareColors = TemplateColors;

const W = 1080;
const MARGIN = 80;

export const decimalsOf = (v: number) => (Number.isInteger(v) ? 0 : Math.round(v * 10) === v * 10 ? 1 : 2);

export function CompareScene({ compare, colors, signoff }: { compare: AnimatedCompare; colors: CompareColors; signoff: string | null }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const tones = colors.light ? TONES.light : TONES.dark;
  const n = compare.columns.length;
  const max = Math.max(...compare.columns.map((c) => c.value));
  const counter = compareCounter(t, max);
  const span = (W - MARGIN * 2) / n;
  const tubeW = Math.min(200, span - 70);
  const tubeTop = 680, tubeH = 470;
  const lastStop = Math.round(COMPARE_TIMES.runEnd * fps);
  const qStart = Math.round(COMPARE_TIMES.question * fps);
  const answer = compare.columns[0].label.toLowerCase();
  // Sound: ticks that follow the shared counter, a whoosh on each headline swap, a thud with each stamp,
  // a hit at the last stop, then a pop and typing for the comment box.
  const cues: SfxCue[] = [
    { at: 0, name: "compare-run", volume: 0.35, frames: lastStop + 6 },
    { at: COMPARE_TIMES.turn * fps, name: "whoosh", volume: 0.45 },
    { at: COMPARE_TIMES.close * fps, name: "whoosh", volume: 0.45 },
    ...compare.columns.filter((c) => c.stamp).map((c): SfxCue => ({ at: compareStopAt(c.value, max) * fps + 6, name: "stamp", volume: 0.8 })),
    { at: lastStop, name: "hit", volume: 0.55 },
    ...(compare.question ? [{ at: qStart, name: "pop", volume: 0.4 }, { at: qStart + 18, name: "typing", volume: 0.3, frames: answer.length * 2 + 2 }] as SfxCue[] : []),
  ];
  const endIn = interpolateEnd(t, COMPARE_TIMES.close);
  const valueSize = Math.min(n <= 2 ? 140 : n === 3 ? 112 : 88, ...compare.columns.map((c) => (span - 24) / (0.62 * compareValueText(c.value, compare.format, compare.unit, decimalsOf(c.value)).length)));
  const surface = surfaceOf(colors);
  const glass = lineOf(colors);

  return (
    <AbsoluteFill style={{ background: colors.bg, color: colors.fg, fontFamily: SANS }}>
      <SwapHeadline colors={colors} steps={[
        { at: 0, h: compare.hook },
        { at: Math.round(COMPARE_TIMES.turn * fps), h: compare.turn },
        { at: Math.round(COMPARE_TIMES.close * fps), h: compare.close },
      ]} />
      <div style={{ position: "absolute", left: 60, right: 60, top: 410, display: "flex", justifyContent: "center", alignItems: "center", gap: 18, flexWrap: "wrap", fontWeight: 500, fontSize: 30, color: colors.dim }}>
        {compare.setup && <span>{compare.setup}</span>}
        {compare.illustrative && <span style={{ padding: "4px 14px", borderRadius: 999, border: `2px solid ${glass}`, fontSize: 26 }}>Example numbers</span>}
      </div>

      {compare.columns.map((col, i) => {
        const x = MARGIN + span * (i + 0.5);
        const stopAt = compareStopAt(col.value, max);
        const done = t >= stopAt;
        const shown = Math.min(counter, col.value);
        const tone = tones[col.tone as CompareTone];
        const fill = max > 0 ? (shown / max) * (tubeH - 16) : 0;
        const stampF = frame - (Math.round(stopAt * fps) + 6);
        const decimals = decimalsOf(col.value);
        const tilt = [-6, -4, 5, 3][i];
        return (
          <div key={i}>
            <div style={{ position: "absolute", left: x - span / 2, width: span, top: 560, textAlign: "center", fontWeight: 700, fontSize: n === 4 ? 30 : 34, lineHeight: 1.15, color: done ? tone : colors.fg }}>
              {col.label}
            </div>
            <div style={{ position: "absolute", left: x - tubeW / 2, top: tubeTop, width: tubeW, height: tubeH, borderRadius: "14px 14px 36px 36px", border: `4px solid ${glass}`, background: surface, overflow: "hidden" }}>
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: fill, background: done ? tone : colors.accent, opacity: done ? 0.9 : 0.85 }} />
              <div style={{ position: "absolute", left: 0, right: 0, bottom: Math.max(0, fill - 14), height: fill > 2 ? 14 : 0, background: colors.fg, opacity: 0.35 }} />
            </div>
            <div style={{ position: "absolute", left: x - span / 2, width: span, top: tubeTop + tubeH + 40, textAlign: "center", fontWeight: 800, fontSize: valueSize, letterSpacing: -2, fontVariantNumeric: "tabular-nums", color: done ? tone : colors.fg }}>
              {compareValueText(done ? col.value : shown, compare.format, compare.unit, decimals)}
            </div>
            {col.stamp && stampF >= 0 && (
              <div style={{ position: "absolute", left: x - span / 2, width: span, top: tubeTop + tubeH * 0.42, textAlign: "center", transform: `rotate(${tilt}deg) scale(${stampScale(stampF)})` }}>
                <span style={{ display: "inline-block", padding: "10px 16px", border: `5px solid ${tone}`, borderRadius: 10, color: tone, background: colors.bg, fontWeight: 800, fontSize: col.stamp.length > 8 ? 32 : n === 4 ? 36 : 44, letterSpacing: 2 }}>
                  {col.stamp}
                </span>
              </div>
            )}
          </div>
        );
      })}

      {compare.note && (
        <div style={{ position: "absolute", left: 60, right: 60, top: tubeTop + tubeH + 40 + valueSize * 1.15, textAlign: "center", fontWeight: 500, fontSize: 30, color: colors.dim, opacity: endIn }}>
          {compare.note}
        </div>
      )}

      {/* The comment box types the first column's label: an option, not a made-up person's comment. */}
      <CommentPrompt question={compare.question} startFrame={qStart} answer={answer} colors={colors} />

      {signoff && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 44, textAlign: "center", fontWeight: 700, fontSize: 32, color: colors.dim, opacity: endIn }}>{signoff}</div>
      )}
      <Flash atFrame={lastStop} colors={colors} />
      <SoundTrack cues={cues} />
    </AbsoluteFill>
  );
}
