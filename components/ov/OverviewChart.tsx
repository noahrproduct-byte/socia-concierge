"use client";

// The performance chart shared by Dashboard and Analytics: bars for the chosen
// metric, an optional quieter series for the previous period, hover and
// keyboard tooltips. Data arrives already computed; nothing is estimated here.

import { useEffect, useMemo, useState } from "react";
import { fmtNum, type Series, type SeriesPoint } from "@/lib/overview";

type Props = {
  series: Series;
  /** Bucket size: "day" plots each point; "week" sums into ISO weeks. */
  granularity?: "day" | "week";
  showPrevious?: boolean;
  height?: number;
  /** Compact = dashboard density (fewer axis labels). */
  compact?: boolean;
  /** Called with the point's post ids when a bar is activated. */
  onPick?: (p: SeriesPoint) => void;
};

const labelDay = (day: string) => new Date(day + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const labelFull = (day: string) => new Date(day + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export default function OverviewChart({ series, granularity = "day", showPrevious = true, height = 240, compact = false, onPick }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(false);
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, [series.metric, granularity]);

  const cur = series.current;
  const prev = showPrevious ? series.previous : [];
  const n = cur.length;
  const W = 1000;
  const H = height;
  const padL = 46, padR = 12, padT = 18, padB = 28;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const max = useMemo(() => {
    const vals = [...cur, ...prev].map((p) => p.value ?? 0);
    const m = Math.max(0, ...vals);
    return m > 0 ? m * 1.12 : 1;
  }, [cur, prev]);
  const y = (v: number) => padT + plotH - (v / max) * plotH;
  const slot = n ? plotW / n : plotW;
  const barW = Math.max(3, Math.min(28, slot * 0.58));
  const x = (i: number) => padL + i * slot + slot / 2;
  const ticks = 4;
  const labelEvery = compact ? Math.ceil(n / 7) : Math.ceil(n / 10);
  const isFollowers = series.metric === "followers";
  const empty = series.provenance === "unavailable" || !cur.some((p) => p.value != null);

  // Followers is a level, not a flow: draw it as a line over quiet bars.
  const linePts = cur.map((p, i) => (p.value == null ? null : `${x(i)},${y(p.value)}`)).filter(Boolean).join(" ");

  const hovered = hover != null ? cur[hover] : null;
  const hoveredPrev = hover != null ? prev[hover] : null;
  const change = hovered?.value != null && hover != null && hover > 0 && cur[hover - 1]?.value != null && cur[hover - 1].value! > 0
    ? ((hovered.value - cur[hover - 1].value!) / cur[hover - 1].value!) * 100
    : null;

  return (
    <div className={`ov-chart${empty ? " empty" : ""}`} data-metric={series.metric}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${series.label}, ${granularity === "week" ? "weekly" : "daily"}`} className="ov-chart-svg">
        {Array.from({ length: ticks + 1 }, (_, t) => {
          const v = (max / ticks) * t;
          const gy = y(v);
          return (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={gy} y2={gy} className="ov-grid" />
              <text x={padL - 8} y={gy + 4} textAnchor="end" className="ov-axis">{t === 0 ? "0" : fmtNum(Math.round(v))}</text>
            </g>
          );
        })}
        {!empty && prev.map((p, i) => p.value == null ? null : (
          <rect key={`p${i}`} x={x(i) - barW / 2} y={y(p.value)} width={barW} height={Math.max(0, padT + plotH - y(p.value))} rx={3} className="ov-bar prev" />
        ))}
        {!empty && cur.map((p, i) => {
          const v = p.value ?? 0;
          const h = Math.max(0, padT + plotH - y(v));
          const on = hover === i;
          return (
            <g key={i} className="ov-barg" tabIndex={0} role="button" aria-label={`${labelFull(p.day)}: ${p.value == null ? "no data" : `${fmtNum(p.value)} ${series.label.toLowerCase()}`}`}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
              onClick={() => onPick?.(p)} onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && onPick) { e.preventDefault(); onPick(p); } }}>
              <rect x={x(i) - slot / 2} y={padT} width={slot} height={plotH} className="ov-hit" />
              {p.value != null && !isFollowers && (
                <rect x={x(i) - barW / 2} y={mounted ? y(v) : padT + plotH} width={barW} height={mounted ? h : 0} rx={3}
                  className={`ov-bar${on ? " on" : ""}`} style={{ transitionDelay: `${Math.min(i * 12, 400)}ms` }} />
              )}
              {p.value != null && isFollowers && on && <circle cx={x(i)} cy={y(v)} r={5} className="ov-dot" />}
            </g>
          );
        })}
        {!empty && isFollowers && linePts && <polyline points={linePts} className={`ov-line${mounted ? " in" : ""}`} fill="none" />}
        {cur.map((p, i) => (i % labelEvery === 0 || i === n - 1) && (
          <text key={`l${i}`} x={x(i)} y={H - 8} textAnchor="middle" className="ov-axis">{granularity === "week" ? `Wk of ${labelDay(p.day)}` : labelDay(p.day)}</text>
        ))}
        {hovered && hover != null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + plotH} className="ov-cross" />}
      </svg>
      {hovered && hover != null && (
        <div className="ov-tip" style={{ left: `${((x(hover) / W) * 100).toFixed(2)}%` }} role="status">
          <small>{granularity === "week" ? `Week of ${labelFull(hovered.day)}` : labelFull(hovered.day)}</small>
          <b>{hovered.value == null ? "No data" : `${fmtNum(hovered.value)} ${series.label.toLowerCase()}`}</b>
          {change != null && <em className={change >= 0 ? "up" : "down"}>{change >= 0 ? "+" : ""}{change.toFixed(0)}% vs. previous {granularity}</em>}
          {hoveredPrev?.value != null && <span>Previous period: {fmtNum(hoveredPrev.value)}</span>}
          {hovered.postIds.length > 0 && <span>{hovered.postIds.length} post{hovered.postIds.length === 1 ? "" : "s"} published</span>}
        </div>
      )}
      {empty && (
        <div className="ov-chart-empty">
          <b>No {series.label.toLowerCase()} data for this period</b>
          <p>{series.note}</p>
        </div>
      )}
    </div>
  );
}
