// The counter template of the animated style (AnimatedCounter in
// lib/animated/spec.ts), drawn to the π-collisions reference: one fixed frame;
// a big number inside a ring counts up with an ease in and out, round by
// round; each round holds, the headline swaps hard to its result, and its line
// joins a scoreboard. Between rounds only the round's own content fades. The
// ring fills on a log scale, so rounds that grow by orders of magnitude still
// read as growth. One brighten at the last round, then a summary and a question.
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { COUNTER_GAP, compareValueText, counterTimeline, roundCount, type AnimatedCounter } from "@/lib/animated/spec";
import { CommentPrompt, Flash, SANS, SwapHeadline, interpolateEnd, lineOf, type TemplateColors } from "./parts";
import { decimalsOf } from "./CompareScene";

const CX = 540, CY = 930, R = 250, STROKE = 26;
const ROWS_TOP = 1262, ROW_H = 64;

export function CounterScene({ counter, colors, signoff }: { counter: AnimatedCounter; colors: TemplateColors; signoff: string | null }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const tl = counterTimeline(counter);
  const n = counter.rounds.length;
  const max = Math.max(...counter.rounds.map((r) => r.value));
  const fillOf = (v: number) => (v <= 0 ? 0 : Math.log10(1 + v) / Math.log10(1 + max));
  const at = (s: number) => Math.round(s * fps);

  // The round on screen: the last one whose fade-in has begun.
  let i = 0;
  for (let k = 0; k < n; k++) if (t >= tl.rounds[k].start - (k === 0 ? 1 : COUNTER_GAP.in)) i = k;
  const round = counter.rounds[i];
  const span = tl.rounds[i];
  const last = i === n - 1;
  const inO = i === 0 ? 1 : interpolate(t, [span.start - COUNTER_GAP.in, span.start], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const outO = last ? 1 : interpolate(t, [span.end, span.end + COUNTER_GAP.out], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const o = Math.min(inO, outO);
  const count = roundCount(t, span, round.value);
  const held = t >= span.end - 0.5;
  const decimals = decimalsOf(round.value);
  const text = compareValueText(held ? round.value : count, counter.format, counter.unit, decimals);
  const numSize = Math.min(170, (2 * R - 90) / (0.6 * text.length));
  const circ = 2 * Math.PI * R;
  const arc = fillOf(held ? round.value : count);
  const endIn = interpolateEnd(t, tl.close);

  const steps = [
    { at: 0, h: counter.hook },
    ...counter.rounds.map((r, k) => ({ at: at(Math.max(2, tl.rounds[k].end)), h: r.result })),
    { at: at(tl.close), h: counter.close },
  ];

  return (
    <AbsoluteFill style={{ background: colors.bg, color: colors.fg, fontFamily: SANS }}>
      <SwapHeadline steps={steps} colors={colors} />
      <div style={{ position: "absolute", left: 60, right: 60, top: 410, display: "flex", justifyContent: "center", alignItems: "center", gap: 18, flexWrap: "wrap", fontWeight: 500, fontSize: 30, color: colors.dim }}>
        {counter.setup && <span>{counter.setup}</span>}
        {counter.illustrative && <span style={{ padding: "4px 14px", borderRadius: 999, border: `2px solid ${lineOf(colors)}`, fontSize: 26 }}>Example numbers</span>}
      </div>

      {/* The round: label, title, ring and number. Only this fades between rounds. */}
      <div style={{ position: "absolute", inset: 0, opacity: o }}>
        <div style={{ position: "absolute", left: 60, right: 60, top: 518, textAlign: "center", fontWeight: 600, fontSize: 30, color: colors.dim }}>{round.label || `Round ${i + 1}`}</div>
        <div style={{ position: "absolute", left: 60, right: 60, top: 560, textAlign: "center", fontWeight: 800, fontSize: 52, letterSpacing: -0.5 }}>{round.title}</div>
        <svg width={1080} height={1920} style={{ position: "absolute", left: 0, top: 0 }}>
          <circle cx={CX} cy={CY} r={R} fill="none" stroke={lineOf(colors)} strokeWidth={STROKE} />
          <circle cx={CX} cy={CY} r={R} fill="none" stroke={colors.accent} strokeWidth={STROKE} strokeLinecap="round"
            strokeDasharray={`${circ * arc} ${circ}`} transform={`rotate(-90 ${CX} ${CY})`} opacity={arc > 0.002 ? 1 : 0} />
        </svg>
        <div style={{ position: "absolute", left: CX - R, width: 2 * R, top: CY - numSize * 0.62, textAlign: "center", fontWeight: 800, fontSize: numSize, letterSpacing: -3, fontVariantNumeric: "tabular-nums", color: held ? colors.accent : colors.fg }}>
          {text}
        </div>
        {counter.measure && (
          <div style={{ position: "absolute", left: CX - R, width: 2 * R, top: CY + numSize * 0.66, textAlign: "center", fontWeight: 500, fontSize: 34, color: colors.dim }}>{counter.measure}</div>
        )}
      </div>

      {/* Scoreboard: each round's line joins when it ends; the newest is brightest. */}
      {counter.rounds.map((r, k) => {
        const joinF = frame - at(tl.rounds[k].end);
        if (joinF < 0) return null;
        const p = interpolate(joinF, [0, 9], [0, 1], { extrapolateRight: "clamp" });
        const newest = k === counter.rounds.findLastIndex((_, j) => frame >= at(tl.rounds[j].end));
        return (
          <div key={k} style={{ position: "absolute", left: 160, right: 160, top: ROWS_TOP + k * ROW_H + (1 - p) * 16, opacity: p, display: "flex", justifyContent: "space-between", gap: 24, alignItems: "baseline", borderBottom: `2px solid ${lineOf(colors)}`, paddingBottom: 10, fontSize: 34, color: newest ? colors.fg : colors.dim }}>
            <span style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.title}</span>
            <span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{compareValueText(r.value, counter.format, counter.unit, decimalsOf(r.value))}</span>
          </div>
        );
      })}

      {counter.note && (
        <div style={{ position: "absolute", left: 60, right: 60, top: ROWS_TOP + n * ROW_H + 18, textAlign: "center", fontWeight: 500, fontSize: 30, color: colors.dim, opacity: endIn }}>{counter.note}</div>
      )}
      <CommentPrompt question={counter.question} startFrame={at(tl.question)} colors={colors} />
      {signoff && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 44, textAlign: "center", fontWeight: 700, fontSize: 32, color: colors.dim, opacity: endIn }}>{signoff}</div>
      )}
      <Flash atFrame={at(tl.rounds[n - 1].end - 0.5)} colors={colors} />
    </AbsoluteFill>
  );
}
