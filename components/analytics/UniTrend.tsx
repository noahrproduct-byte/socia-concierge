"use client";

// A normalized-native trend chart. It reads a NormalizedSeries directly, so it
// works for any platform. Two honesty rules are built in:
//   • A null day is a GAP, never a zero bar / interpolated line.
//   • When the series isn't a genuine per-day platform series, the caption says
//     exactly what the marks are (series.note) — the chart never implies a
//     daily account trend that the data can't support.

import { useId } from "react";
import type { NormalizedSeries } from "@/lib/analytics/types";

const fmt = (n: number | null | undefined, unit: NormalizedSeries["unit"]): string => {
  if (n == null) return "—";
  if (unit === "minutes") {
    const h = n / 60;
    return h >= 1 ? `${h >= 10 ? Math.round(h) : h.toFixed(1)}h` : `${Math.round(n)}m`;
  }
  if (unit === "percent") return `${n.toFixed(1)}%`;
  return n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K` : n.toLocaleString("en-US");
};

const md = (day: string) => {
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${MON[+day.slice(5, 7) - 1]} ${+day.slice(8, 10)}`;
};

export default function UniTrend({ series, height = 220 }: { series: NormalizedSeries; height?: number }) {
  const gid = useId();
  const pts = series.current;
  const vals = pts.map((p) => p.value).filter((v): v is number => v != null);
  const empty = series.provenance === "unavailable" || vals.length === 0;

  if (empty) {
    return (
      <div className="uni-chart uni-chart-empty" style={{ minHeight: height }}>
        <p className="uni-empty-title">No {series.label.toLowerCase()} data for this period</p>
        {series.note && <p className="uni-chart-note">{series.note}</p>}
      </div>
    );
  }

  const W = 720;
  const H = height;
  const padX = 8;
  const padTop = 12;
  const padBottom = 26;
  const max = Math.max(...vals, 1);
  const innerW = W - padX * 2;
  const innerH = H - padTop - padBottom;
  const n = pts.length;
  const x = (i: number) => padX + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padTop + innerH - (v / max) * innerH;
  const tickEvery = Math.max(1, Math.ceil(n / 6));
  const isLine = series.render === "line";

  return (
    <figure className="uni-chart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={`${series.label} by day`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={`uni-fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {isLine ? (
          <LineBody pts={pts} x={x} y={y} baseY={padTop + innerH} gid={gid} />
        ) : (
          pts.map((p, i) =>
            p.value == null ? null : (
              <rect
                key={i}
                x={x(i) - Math.min(14, innerW / n / 1.6)}
                y={y(p.value)}
                width={Math.min(28, (innerW / n) * 0.72)}
                height={Math.max(1, padTop + innerH - y(p.value))}
                rx={3}
                className="uni-bar"
              >
                <title>{`${md(p.day)}: ${fmt(p.value, series.unit)}`}</title>
              </rect>
            ),
          )
        )}

        {pts.map((p, i) =>
          i % tickEvery === 0 ? (
            <text key={`t${i}`} x={x(i)} y={H - 8} textAnchor="middle" className="uni-axis">
              {md(p.day)}
            </text>
          ) : null,
        )}
      </svg>
      <figcaption className="uni-chart-foot">
        <span className="uni-chart-total">
          {fmt(series.total, series.unit)} {series.label.toLowerCase()}
        </span>
        {series.note && <span className="uni-chart-note">{series.note}</span>}
      </figcaption>
    </figure>
  );
}

function LineBody({
  pts,
  x,
  y,
  baseY,
  gid,
}: {
  pts: NormalizedSeries["current"];
  x: (i: number) => number;
  y: (v: number) => number;
  baseY: number;
  gid: string;
}) {
  // Break the line across null gaps into separate segments.
  const segs: { i: number; v: number }[][] = [];
  let cur: { i: number; v: number }[] = [];
  pts.forEach((p, i) => {
    if (p.value == null) {
      if (cur.length) segs.push(cur);
      cur = [];
    } else cur.push({ i, v: p.value });
  });
  if (cur.length) segs.push(cur);

  return (
    <>
      {segs.map((seg, si) => {
        const d = seg.map((s, k) => `${k === 0 ? "M" : "L"} ${x(s.i)} ${y(s.v)}`).join(" ");
        const area = `${d} L ${x(seg[seg.length - 1].i)} ${baseY} L ${x(seg[0].i)} ${baseY} Z`;
        return (
          <g key={si}>
            {seg.length > 1 && <path d={area} fill={`url(#uni-fill-${gid})`} />}
            <path d={d} className="uni-line" fill="none" />
            {seg.map((s, k) => (
              <circle key={k} cx={x(s.i)} cy={y(s.v)} r={2.4} className="uni-dot" />
            ))}
          </g>
        );
      })}
    </>
  );
}
