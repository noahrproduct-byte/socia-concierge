"use client";

// Multi-account overlay for the Performance Over Time card. Draws one line per
// selected account on a shared day axis, using the SAME visual language as
// OverviewChart (ov-chart classes, grid, axis, crosshair, tip). Only accounts
// that actually have a series for the chosen metric get a line; the rest are
// reported honestly in the footnote. A null day is a gap, never a zero.

import { useMemo, useState } from "react";
import { bucketize, bucketLabel, bucketTitle, fmtNum, type Granularity, type SeriesPoint } from "@/lib/overview";

export type OverlayLine = {
  id: string;
  platform: "instagram" | "youtube" | "facebook" | "tiktok";
  label: string;
  points: SeriesPoint[];
  mode: "sum" | "last";
  /** false when this is content totals by publish date, not a daily series. */
  trueSeries: boolean;
};

const TINT: Record<OverlayLine["platform"], string> = { instagram: "#d6357a", youtube: "#e0332a", facebook: "#1877f2", tiktok: "#22d3ee" };

export default function MultiLineChart({
  lines,
  granularity = "day",
  height = 260,
  unit,
  today,
}: {
  lines: OverlayLine[];
  granularity?: Granularity;
  height?: number;
  unit: string;
  today?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const series = useMemo(
    () => lines.map((l) => ({ ...l, buckets: bucketize(l.points, granularity, l.mode, today) })),
    [lines, granularity, today],
  );
  const withData = series.filter((s) => s.buckets.some((b) => b.value != null));

  const W = 1000, H = height, padL = 46, padR = 12, padT = 22, padB = 28;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const n = Math.max(0, ...withData.map((s) => s.buckets.length));
  const axis = (withData.reduce((a, s) => (s.buckets.length > a.length ? s.buckets : a), withData[0]?.buckets ?? []) ?? []);
  const allVals = withData.flatMap((s) => s.buckets.map((b) => b.value).filter((v): v is number => v != null));
  const max = allVals.length ? Math.max(...allVals) * 1.12 : 1;
  const min = 0;
  const y = (v: number) => padT + plotH - ((Math.min(v, max) - min) / (max - min || 1)) * plotH;
  const slot = n ? plotW / n : plotW;
  const x = (i: number) => padL + i * slot + slot / 2;
  const ticks = 4;
  const labelEvery = Math.max(1, Math.ceil(n / (granularity === "day" ? 10 : 12)));

  const valAt = (bkts: typeof axis, i: number) => (i < bkts.length ? bkts[i].value : null);

  if (!withData.length) {
    return (
      <div className="ov-chart empty">
        <div className="ov-chart-empty"><b>No trend data for the selected accounts</b><p>None of the selected accounts report a daily {unit} series for this period.</p></div>
      </div>
    );
  }

  return (
    <div className="ov-chart">
      <div className="mlc-legend">
        {series.map((s) => (
          <span key={s.id} className={`mlc-leg${s.buckets.some((b) => b.value != null) ? "" : " off"}`}>
            <span className="mlc-dot" style={{ background: TINT[s.platform] }} />{s.label}{s.buckets.some((b) => b.value != null) ? "" : " · no data"}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${unit} by ${granularity}, ${withData.length} account${withData.length === 1 ? "" : "s"}`} className="ov-chart-svg" onMouseLeave={() => setHover(null)}>
        {Array.from({ length: ticks + 1 }, (_, t) => {
          const v = min + ((max - min) / ticks) * t;
          const gy = y(v);
          return (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={gy} y2={gy} className="ov-grid" />
              <text x={padL - 8} y={gy + 4} textAnchor="end" className="ov-axis">{t === 0 ? "0" : fmtNum(Math.round(v))}</text>
            </g>
          );
        })}
        {withData.map((s) => {
          // break the line at null gaps
          const segs: string[] = [];
          let cur: string[] = [];
          s.buckets.forEach((b, i) => {
            if (b.value == null) { if (cur.length) segs.push(cur.join(" ")); cur = []; }
            else cur.push(`${x(i)},${y(b.value)}`);
          });
          if (cur.length) segs.push(cur.join(" "));
          return (
            <g key={s.id}>
              {segs.map((pts, si) => <polyline key={si} points={pts} fill="none" stroke={TINT[s.platform]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
              {hover != null && valAt(s.buckets, hover) != null && <circle cx={x(hover)} cy={y(valAt(s.buckets, hover)!)} r={3.5} fill={TINT[s.platform]} />}
            </g>
          );
        })}
        {axis.map((_, i) => (
          <rect key={`h${i}`} x={x(i) - slot / 2} y={padT} width={slot} height={plotH} className="ov-hit" onMouseEnter={() => setHover(i)} />
        ))}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + plotH} className="ov-cross" />}
        {axis.map((b, i) => i % labelEvery === 0 && (
          <text key={`l${i}`} x={x(i)} y={H - 8} textAnchor="middle" className="ov-axis">{bucketLabel(b, granularity)}</text>
        ))}
      </svg>
      {hover != null && axis[hover] && (
        <div className={`ov-tip${x(hover) > W * 0.7 ? " left" : ""}`} style={{ left: `${((x(hover) / W) * 100).toFixed(2)}%` }} role="status">
          <small>{bucketTitle(axis[hover], granularity)}</small>
          {withData.map((s) => {
            const v = valAt(s.buckets, hover);
            return (
              <span key={s.id} className="mlc-tip-row">
                <span className="mlc-dot" style={{ background: TINT[s.platform] }} />
                {s.label}
                <b>{v == null ? "—" : `${fmtNum(v)} ${unit}`}</b>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
