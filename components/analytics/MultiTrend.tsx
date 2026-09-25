"use client";

// Multi-line performance chart: one line per platform, aligned on a shared day
// axis, for the All-Accounts view (and a single line for one account). Only a
// platform that actually has a series for the chosen metric gets a line — a
// platform with no daily data is simply absent, never a flat fake line. The
// hover tooltip shows each platform's value on that day. Honesty note: where a
// platform's "series" is content totals stamped on publish day rather than a
// true daily account series, the caption says so.

import { useId, useState } from "react";
import type { MetricKey, NormalizedAccountAnalytics, NormalizedSeries, Platform } from "@/lib/analytics/types";
import { platformCapability } from "@/lib/analytics/capabilities";

const TINT: Record<Platform, string> = { instagram: "#d6357a", youtube: "#e0332a", facebook: "#1877f2", tiktok: "#22d3ee" };

const fmt = (n: number | null, unit: NormalizedSeries["unit"]): string => {
  if (n == null) return "—";
  if (unit === "minutes") { const h = n / 60; return h >= 1 ? `${h >= 10 ? Math.round(h) : h.toFixed(1)}h` : `${Math.round(n)}m`; }
  if (unit === "percent") return `${n.toFixed(1)}%`;
  return n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K` : n.toLocaleString("en-US");
};
const md = (day: string) => { const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]; return `${M[+day.slice(5, 7) - 1]} ${+day.slice(8, 10)}`; };

export type TrendLine = { platform: Platform; label: string; series: NormalizedSeries };

export default function MultiTrend({ lines, height = 240 }: { lines: TrendLine[]; height?: number }) {
  const gid = useId();
  const [hover, setHover] = useState<number | null>(null);

  const withData = lines.filter((l) => l.series.current.some((p) => p.value != null));
  if (!withData.length) {
    const note = lines[0]?.series.note;
    return (
      <div className="uni-chart uni-chart-empty" style={{ minHeight: height }}>
        <p className="uni-empty-title">No {lines[0]?.series.label.toLowerCase() ?? "data"} for this period</p>
        {note && <p className="uni-chart-note">{note}</p>}
      </div>
    );
  }

  // Shared day axis = the longest line's days (all share the same range grid).
  const axis = withData.reduce((a, b) => (b.series.current.length > a.length ? b.series.current : a), withData[0].series.current).map((p) => p.day);
  const unit = withData[0].series.unit;
  const valAt = (l: TrendLine, day: string) => l.series.current.find((p) => p.day === day)?.value ?? null;
  const allVals = withData.flatMap((l) => l.series.current.map((p) => p.value).filter((v): v is number => v != null));
  const max = Math.max(...allVals, 1);

  const W = 720, H = height, padX = 10, padTop = 14, padBottom = 26;
  const innerW = W - padX * 2, innerH = H - padTop - padBottom, n = axis.length;
  const x = (i: number) => padX + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padTop + innerH - (v / max) * innerH;
  const tickEvery = Math.max(1, Math.ceil(n / 7));
  const impure = withData.some((l) => l.series.provenance === "publish_totals");

  return (
    <figure className="uni-chart">
      <div className="uni-legend">
        {withData.map((l) => (
          <span key={l.platform} className="uni-legend-item"><span className="uni-legend-dot" style={{ background: TINT[l.platform] }} />{l.label}</span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={`${withData[0].series.label} over time by platform`} onMouseLeave={() => setHover(null)}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={padX} x2={W - padX} y1={padTop + innerH * (1 - f)} y2={padTop + innerH * (1 - f)} className="uni-grid" />
        ))}
        {withData.map((l) => {
          const segs: { i: number; v: number }[][] = [];
          let cur: { i: number; v: number }[] = [];
          axis.forEach((day, i) => { const v = valAt(l, day); if (v == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push({ i, v }); });
          if (cur.length) segs.push(cur);
          return (
            <g key={l.platform}>
              {segs.map((seg, si) => (
                <path key={si} d={seg.map((s, k) => `${k === 0 ? "M" : "L"} ${x(s.i)} ${y(s.v)}`).join(" ")} fill="none" stroke={TINT[l.platform]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              ))}
              {segs.flat().map((s, k) => <circle key={k} cx={x(s.i)} cy={y(s.v)} r={2.2} fill={TINT[l.platform]} />)}
            </g>
          );
        })}
        {/* hover columns */}
        {axis.map((_, i) => (
          <rect key={i} x={x(i) - innerW / n / 2} y={padTop} width={innerW / n} height={innerH} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={padTop} y2={padTop + innerH} className="uni-cursor" />}
        {axis.map((day, i) => (i % tickEvery === 0 ? <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="uni-axis">{md(day)}</text> : null))}
      </svg>
      {hover != null && (
        <div className="uni-tip">
          <div className="uni-tip-day">{md(axis[hover])}</div>
          {withData.map((l) => {
            const v = valAt(l, axis[hover]);
            if (v == null) return null;
            return <div key={l.platform} className="uni-tip-row"><span className="uni-legend-dot" style={{ background: TINT[l.platform] }} />{l.label}<span className="uni-tip-val">{fmt(v, unit)}</span></div>;
          })}
        </div>
      )}
      {impure && (
        <figcaption className="uni-chart-foot">
          <span className="uni-chart-info" title="Lines marked by publish date show each post's totals on the day it went out, not a daily account series.">ⓘ About this data</span>
        </figcaption>
      )}
    </figure>
  );
}
