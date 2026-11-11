// The comparison template of the animated style (AnimatedCompare in
// lib/animated/spec.ts), drawn to the timing taken from the reference Reels:
// one fixed frame that never cuts; columns that count up together, each
// stopping at its value, snapping to its colour and getting a spring stamp
// 200 ms later; the top value slows into its stop; headlines swap hard with a
// short blur; one brighten at the last stop; it ends on a comment question.
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont as loadSans } from "@remotion/google-fonts/Inter";
import { loadFont as loadSerif } from "@remotion/google-fonts/InstrumentSerif";
import { COMPARE_TIMES, compareCounter, compareStopAt, compareValueText, type AnimatedCompare, type CompareHeadline, type CompareTone } from "@/lib/animated/spec";

const { fontFamily: SANS } = loadSans("normal", { weights: ["500", "700", "800"], subsets: ["latin"] });
const { fontFamily: SERIF } = loadSerif("italic", { subsets: ["latin"] });

export type CompareColors = { bg: string; fg: string; dim: string; accent: string; light: boolean };

const TONE = {
  dark: { win: "#8BCB8E", lose: "#E8634F", neutral: "#7A7069" },
  light: { win: "#2F8A4E", lose: "#CC3F2C", neutral: "#9A928A" },
} as const;

const W = 1080;
const MARGIN = 80;

/** Spring stamp: 100 -> 85 -> 110 -> 100 % over ~300 ms. */
const stampScale = (f: number) => interpolate(f, [0, 3, 6, 9], [1, 0.85, 1.1, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
const decimalsOf = (v: number) => (Number.isInteger(v) ? 0 : Math.round(v * 10) === v * 10 ? 1 : 2);

function Headline({ steps, colors }: { steps: { at: number; h: CompareHeadline }[]; colors: CompareColors }) {
  const frame = useCurrentFrame();
  const cur = [...steps].reverse().find((s) => frame >= s.at) ?? steps[0];
  const since = frame - cur.at;
  // Hard swap: ~100 ms of blur and a small slide, never a cross-fade.
  const blur = cur.at > 0 && since < 3 ? [8, 4, 1][since] : 0;
  const shift = cur.at > 0 && since < 3 ? [-18, -6, 0][since] : 0;
  const [a, b] = cur.h.lines;
  const i = cur.h.key ? b.toLowerCase().indexOf(cur.h.key.toLowerCase()) : -1;
  const line = { fontFamily: SANS, fontWeight: 800, fontSize: 68, lineHeight: 1.08, letterSpacing: -1.5, color: colors.fg } as const;
  return (
    <div style={{ position: "absolute", left: 70, right: 70, top: 170, textAlign: "center", filter: `blur(${blur}px)`, transform: `translateX(${shift}px)` }}>
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

export function CompareScene({ compare, colors, signoff }: { compare: AnimatedCompare; colors: CompareColors; signoff: string | null }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const tones = colors.light ? TONE.light : TONE.dark;
  const n = compare.columns.length;
  const max = Math.max(...compare.columns.map((c) => c.value));
  const counter = compareCounter(t, max);
  const span = (W - MARGIN * 2) / n;
  const tubeW = Math.min(200, span - 70);
  const tubeTop = 680, tubeH = 470;
  const lastStop = Math.round(COMPARE_TIMES.runEnd * fps);
  const flashF = frame - lastStop;
  const flash = flashF >= 0 && flashF < 8 ? interpolate(flashF, [0, 2, 8], [0, colors.light ? 0.1 : 0.14, 0]) : 0;
  const endIn = interpolate(t, [COMPARE_TIMES.close, COMPARE_TIMES.close + 0.4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const qF = frame - Math.round(COMPARE_TIMES.question * fps);
  const qIn = qF < 0 ? 0 : interpolate(qF, [0, 9], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  // The comment box types the first column's label: an option, not a made-up person's comment.
  const answer = compare.columns[0].label.toLowerCase();
  const typed = answer.slice(0, Math.max(0, Math.floor((qF - 18) / 2)));
  const caret = Math.floor(frame / 15) % 2 === 0 ? "|" : " ";
  const valueSize = Math.min(n <= 2 ? 140 : n === 3 ? 112 : 88, ...compare.columns.map((c) => (span - 24) / (0.62 * compareValueText(c.value, compare.format, compare.unit, decimalsOf(c.value)).length)));
  const surface = colors.light ? "rgba(20,20,20,0.06)" : "rgba(255,255,255,0.06)";
  const glass = colors.light ? "rgba(20,20,20,0.16)" : "rgba(255,255,255,0.16)";

  return (
    <AbsoluteFill style={{ background: colors.bg, color: colors.fg, fontFamily: SANS }}>
      <Headline colors={colors} steps={[
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

      {compare.question && qIn > 0 && (
        <div style={{ position: "absolute", left: 90, right: 90, top: 1600 + (1 - qIn) * 40, opacity: qIn }}>
          <div style={{ fontWeight: 700, fontSize: 38, color: colors.fg, marginBottom: 18, textAlign: "center" }}>{compare.question}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "20px 26px", borderRadius: 40, background: surface, border: `2px solid ${glass}` }}>
            <div style={{ width: 52, height: 52, borderRadius: 26, background: glass, flex: "none" }} />
            <div style={{ flex: 1, fontWeight: 500, fontSize: 36, color: typed ? colors.fg : colors.dim }}>{typed ? typed + caret : "Add a comment…"}</div>
            <div style={{ fontWeight: 700, fontSize: 34, color: colors.accent, opacity: typed.length === answer.length ? 1 : 0.45 }}>Post</div>
          </div>
        </div>
      )}

      {signoff && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 70, textAlign: "center", fontWeight: 700, fontSize: 34, color: colors.dim, opacity: endIn }}>{signoff}</div>
      )}
      <AbsoluteFill style={{ background: colors.light ? "#FFFFFF" : "#FFF6E8", opacity: flash, pointerEvents: "none" }} />
    </AbsoluteFill>
  );
}
