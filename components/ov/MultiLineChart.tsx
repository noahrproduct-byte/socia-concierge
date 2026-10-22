"use client";

// Multi-account overlay for the Performance Over Time card. Draws one line per
// selected account on a shared day axis, in the same language as OverviewChart
// (app/styles/charts.css: grid, axis, crosshair, tip). The first account takes
// the data hue and the rest are neutrals ([data-series] 1 to 4); the platform
// mark beside each name says which platform it is. Only accounts that actually
// have a series for the chosen metric get a line; the rest are reported
// honestly in the legend and by the parent. A null day is a gap, never a zero.

import "@/app/styles/charts.css";
import { useMemo, useRef, useState } from "react";
import { PlatformMark } from "@/components/system";
import { bucketize, bucketLabel, bucketTitle, fmtNum, type Granularity, type SeriesPoint } from "@/lib/overview";
import { moveBucketFocus, useChartWidth } from "./chartSize";

export type OverlayLine = {
  id: string;
  platform: "instagram" | "youtube" | "facebook" | "tiktok";
  label: string;
  points: SeriesPoint[];
  mode: "sum" | "last";
  /** false when this is content totals by publish date, not a daily series. */
  trueSeries: boolean;
};

const DASH = String.fromCharCode(0x2014);

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
  const wrap = useRef<HTMLDivElement>(null);
  const W = useChartWidth(wrap, 720);
  const [hover, setHover] = useState<number | null>(null);
  const [stop, setStop] = useState<number | null>(null);

  const series = useMemo(
    () => lines.map((l, i) => ({ ...l, tone: (i % 4) + 1, buckets: bucketize(l.points, granularity, l.mode, today) })),
    [lines, granularity, today],
  );
  const withData = series.filter((s) => s.buckets.some((b) => b.value != null));

  const H = height, padL = 46, padR = 12, padT = 22, padB = 28;
  const plotW = Math.max(1, W - padL - padR), plotH = H - padT - padB;
  const n = Math.max(0, ...withData.map((s) => s.buckets.length));
  const axis = (withData.reduce((a, s) => (s.buckets.length > a.length ? s.buckets : a), withData[0]?.buckets ?? []) ?? []);
  const allVals = withData.flatMap((s) => s.buckets.map((b) => b.value).filter((v): v is number => v != null));
  const max = allVals.length ? Math.max(...allVals) * 1.12 : 1;
  const min = 0;
  const y = (v: number) => padT + plotH - ((Math.min(v, max) - min) / (max - min || 1)) * plotH;
  const slot = n ? plotW / n : plotW;
  const x = (i: number) => padL + i * slot + slot / 2;
  const ticks = 4;
  const labelCap = Math.max(2, Math.min(granularity === "day" ? 10 : 12, Math.floor(plotW / 72)));
  const labelEvery = Math.max(1, Math.ceil(n / labelCap));
  const tabStop = stop != null && stop < axis.length ? stop : axis.length - 1;

  const valAt = (bkts: typeof axis, i: number) => (i < bkts.length ? bkts[i].value : null);
  const grid = (
    <g aria-hidden>
      {Array.from({ length: ticks + 1 }, (_, t) => {
        const v = min + ((max - min) / ticks) * t;
        const gy = y(v);
        return (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={gy} y2={gy} className="s-chart-grid" />
            <text x={padL - 8} y={gy + 4} textAnchor="end" className="s-chart-axis">{t === 0 ? "0" : fmtNum(Math.round(v))}</text>
          </g>
        );
      })}
    </g>
  );

  if (!withData.length) {
    // The empty frame stays drawn at its real height, one sentence over it.
    return (
      <div ref={wrap} className="s-chart is-empty">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="s-chart-svg" aria-hidden>{grid}</svg>
        <div className="s-chart-empty">
          <div>
            <b>No trend data for the selected accounts</b>
            <p>None of the selected accounts report a daily {unit} series for this period.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={wrap} className="s-chart">
      <div className="s-chart-legend">
        {series.map((s) => {
          const has = s.buckets.some((b) => b.value != null);
          return (
            <span key={s.id} className={has ? undefined : "is-off"}>
              <i className="s-chart-swatch" data-series={s.tone} aria-hidden />
              <PlatformMark platform={s.platform} size="sm" />
              {s.label}{has ? "" : " · no data"}
            </span>
          );
        })}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="group" aria-label={`${unit} by ${granularity}, ${withData.length} account${withData.length === 1 ? "" : "s"}`} className="s-chart-svg" onMouseLeave={() => setHover(null)}>
        {grid}
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
            <g key={s.id} data-series={s.tone} aria-hidden>
              {segs.map((pts, si) => <polyline key={si} points={pts} className="s-chart-line" />)}
              {hover != null && valAt(s.buckets, hover) != null && <circle cx={x(hover)} cy={y(valAt(s.buckets, hover)!)} r={4} className="s-chart-dot" />}
            </g>
          );
        })}
        {axis.map((b, i) => (
          <g key={`h${i}`} data-bucket={i} className="s-chart-focus" tabIndex={i === tabStop ? 0 : -1} role="img"
            aria-label={`${bucketTitle(b, granularity)}: ${withData.map((s) => { const v = valAt(s.buckets, i); return `${s.label} ${v == null ? "no data" : `${fmtNum(v)} ${unit}`}`; }).join(", ")}`}
            onMouseEnter={() => setHover(i)} onFocus={() => { setHover(i); setStop(i); }} onBlur={() => setHover(null)}
            onKeyDown={(e) => { if (moveBucketFocus(wrap.current, i, e.key, axis.length) != null) e.preventDefault(); }}>
            <rect x={x(i) - slot / 2} y={padT} width={slot} height={plotH} className="s-chart-hit" />
          </g>
        ))}
        <g aria-hidden>
          {hover != null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + plotH} className="s-chart-cross" />}
          {axis.map((b, i) => i % labelEvery === 0 && (
            <text key={`l${i}`} x={x(i)} y={H - 8} textAnchor="middle" className="s-chart-axis">{bucketLabel(b, granularity)}</text>
          ))}
        </g>
      </svg>
      {hover != null && axis[hover] && (
        <div className={`s-chart-tip${x(hover) > W * 0.7 ? " is-left" : ""}`} style={{ left: Math.round(x(hover)) }} role="status">
          <small>{bucketTitle(axis[hover], granularity)}</small>
          {withData.map((s) => {
            const v = valAt(s.buckets, hover);
            return (
              <span key={s.id} className="s-chart-tip-row">
                <i className="s-chart-swatch" data-series={s.tone} aria-hidden />
                {s.label}
                <b>{v == null ? DASH : `${fmtNum(v)} ${unit}`}</b>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
