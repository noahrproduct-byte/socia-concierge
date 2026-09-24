"use client";

// CONTENT mode: every published item as a discrete bar on a publish-date
// timeline, across all visible platforms. This is not a time series — each bar
// is one post's total for the chosen metric, placed on the day it went out, so
// it's honest to show cross-platform here (unlike a daily-trend line). Bar
// colour = platform; height = the metric; hover = a rich content tooltip.

import { useState } from "react";
import type { MetricKey, NormalizedPost, Platform } from "@/lib/analytics/types";
import { platformCapability } from "@/lib/analytics/capabilities";

const TINT: Record<Platform, string> = { instagram: "#d6357a", youtube: "#e0332a", facebook: "#1877f2", tiktok: "#22d3ee" };
const fmtN = (v: number | null | undefined): string => (v == null ? "—" : v >= 1e6 ? `${(v / 1e6).toFixed(1).replace(/\.0$/, "")}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1).replace(/\.0$/, "")}K` : v.toLocaleString("en-US"));
const fmtMult = (x: number) => `${x >= 10 ? x.toFixed(0) : x.toFixed(1)}×`;
const md = (day: string) => { const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]; const d = new Date(day); return `${M[d.getMonth()]} ${d.getDate()}`; };

function metricOf(p: NormalizedPost, metric: MetricKey): number | null {
  if (metric === "engagement") return p.engagement;
  return p.metrics[metric] ?? (metric === "views" ? null : p.engagement);
}

export default function ContentTimeline({ posts, metric, rangeDays, display = "raw", height = 260 }: { posts: NormalizedPost[]; metric: MetricKey; rangeDays: number; display?: "raw" | "typical"; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const typical = display === "typical";

  const now = Date.now();
  const since = now - rangeDays * 86400000;
  const items = posts
    .filter((p) => p.publishedAt && !isNaN(new Date(p.publishedAt).getTime()) && new Date(p.publishedAt).getTime() >= since)
    .map((p) => ({ p, v: typical ? p.multiplier : metricOf(p, metric), t: new Date(p.publishedAt).getTime() }))
    .filter((x): x is { p: NormalizedPost; v: number; t: number } => x.v != null)
    .sort((a, b) => a.t - b.t);

  if (!items.length) {
    return <div className="uni-chart uni-chart-empty" style={{ minHeight: height }}><p className="uni-empty-title">{typical ? "No content with a baseline yet in this period" : `No content with ${metric === "engagement" ? "interactions" : metric} in this period`}</p></div>;
  }

  const W = 720, H = height, padX = 10, padTop = 14, padBottom = 26;
  const innerW = W - padX * 2, innerH = H - padTop - padBottom, n = items.length;
  const max = Math.max(...items.map((i) => i.v), 1);
  const bw = Math.max(3, Math.min(26, (innerW / n) * 0.7));
  const x = (i: number) => padX + (n <= 1 ? innerW / 2 : (i / (n - 1)) * (innerW - bw) + bw / 2);
  const y = (v: number) => padTop + innerH - (v / max) * innerH;
  const tickEvery = Math.max(1, Math.ceil(n / 7));
  const h = hover != null ? items[hover] : null;

  return (
    <figure className="uni-chart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={`Content by publish date, ${metric}`} onMouseLeave={() => setHover(null)}>
        {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={padX} x2={W - padX} y1={padTop + innerH * (1 - f)} y2={padTop + innerH * (1 - f)} className="uni-grid" />)}
        {items.map((it, i) => (
          <rect key={i} x={x(i) - bw / 2} y={y(it.v)} width={bw} height={Math.max(1, padTop + innerH - y(it.v))} rx={2.5} fill={TINT[it.p.platform]} opacity={hover == null || hover === i ? 1 : 0.45} onMouseEnter={() => setHover(i)}>
            <title>{`${platformCapability(it.p.platform).label} · ${md(it.p.publishedAt)}: ${typical ? fmtMult(it.v) : fmtN(it.v)}`}</title>
          </rect>
        ))}
        {items.map((it, i) => (i % tickEvery === 0 ? <text key={`t${i}`} x={x(i)} y={H - 8} textAnchor="middle" className="uni-axis">{md(it.p.publishedAt)}</text> : null))}
      </svg>
      {h && (
        <div className="uni-ctip">
          {h.p.thumb && <span className="uni-ctip-thumb" style={{ backgroundImage: `url(${h.p.thumb})` }} />}
          <div className="uni-ctip-meta">
            <span className="uni-ctip-title">{h.p.title || "(no caption)"}</span>
            <span className="uni-ctip-sub"><span className="uni-legend-dot" style={{ background: TINT[h.p.platform] }} />{platformCapability(h.p.platform).label} · {md(h.p.publishedAt)}</span>
            <span className="uni-ctip-stats">
              {h.p.metrics.views != null && <span>{fmtN(h.p.metrics.views)} views</span>}
              {h.p.metrics.likes != null && <span>{fmtN(h.p.metrics.likes)} likes</span>}
              {h.p.metrics.comments != null && <span>{fmtN(h.p.metrics.comments)} comments</span>}
              {h.p.multiplier != null && <span className={h.p.multiplier >= 1 ? "up" : "down"}>{fmtMult(h.p.multiplier)} typical</span>}
            </span>
          </div>
        </div>
      )}
    </figure>
  );
}
