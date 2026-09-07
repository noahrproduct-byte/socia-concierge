"use client";

// Follower history: SOCIA's own daily snapshots as a line with dots, grouped
// by day / week / month. A level, never a sum: weekly and monthly points are
// the count at the end of the period, with the net change in the tooltip.
// The axis starts where tracking started; nothing earlier is drawn.

import { useEffect, useMemo, useState } from "react";
import { bucketFollowers, type FollowerPoint, type FollowerGranularity, type FollowerBucket } from "@/lib/followers";
import { fmtNum } from "@/lib/overview";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const md = (day: string) => `${MON[+day.slice(5, 7) - 1]} ${+day.slice(8, 10)}`;
const full = (day: string) => new Date(day + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const title = (b: FollowerBucket, g: FollowerGranularity) =>
  g === "day" ? full(b.end) : g === "week" ? `Week of ${md(b.start)} · ending ${md(b.end)}` : g === "month" ? new Date(b.key + "-01T00:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) : b.key;

export default function FollowerChart({ points, granularity = "day", height = 200, today, compact = false }: { points: FollowerPoint[]; granularity?: FollowerGranularity; height?: number; today?: string; compact?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(false); const t = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(t); }, [granularity, points.length]);
  const buckets = useMemo(() => bucketFollowers(points, granularity, today ?? new Date().toISOString().slice(0, 10)), [points, granularity, today]);
  const n = buckets.length;
  if (n < 2) {
    return (
      <div className="ov-empty small">
        <b>{n === 1 ? "Follower tracking started today." : "No follower snapshots yet."}</b>
        <p>{n === 1 ? `${buckets[0].followers.toLocaleString("en-US")} followers recorded. The line appears once there are two days of history; SOCIA records one snapshot a day from here on.` : "SOCIA records your follower count once a day from the moment an account is connected."}</p>
      </div>
    );
  }
  const W = 1000, H = height, padL = 52, padR = 14, padT = 16, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const vals = buckets.map((b) => b.followers);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = Math.max(hi - lo, Math.max(4, Math.round(hi * 0.004)));
  const min = lo - span * 0.25, max = hi + span * 0.25;
  const x = (i: number) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => padT + plotH - ((v - min) / (max - min)) * plotH;
  const line = buckets.map((b, i) => `${x(i)},${y(b.followers)}`).join(" ");
  const area = `${x(0)},${padT + plotH} ${line} ${x(n - 1)},${padT + plotH}`;
  const ticks = 3;
  const labelEvery = Math.max(1, Math.ceil(n / (compact ? 5 : 8)));
  const h = hover != null ? buckets[hover] : null;
  const first = buckets[0];

  return (
    <div className="ov-chart fc" data-metric="followers">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Followers from ${fmtNum(first.followers)} on ${md(first.end)} to ${fmtNum(buckets[n - 1].followers)} on ${md(buckets[n - 1].end)}`} className="ov-chart-svg">
        <defs>
          <linearGradient id="fc-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--success)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--success)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {Array.from({ length: ticks + 1 }, (_, t) => {
          const v = min + ((max - min) / ticks) * t;
          return (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} className="ov-grid" />
              <text x={padL - 8} y={y(v) + 4} textAnchor="end" className="ov-axis">{Math.round(v).toLocaleString("en-US")}</text>
            </g>
          );
        })}
        <polygon points={area} fill="url(#fc-fill)" className={`fc-area${mounted ? " in" : ""}`} />
        <polyline points={line} fill="none" className={`ov-line${mounted ? " in" : ""}`} />
        {buckets.map((b, i) => (
          <g key={b.key} className="ov-barg" tabIndex={0} role="button" aria-label={`${title(b, granularity)}: ${b.followers.toLocaleString("en-US")} followers${b.net != null ? `, ${b.net >= 0 ? "+" : ""}${b.net} net` : ""}`}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
            <rect x={x(i) - (n > 1 ? plotW / (n - 1) / 2 : plotW / 2)} y={padT} width={n > 1 ? plotW / (n - 1) : plotW} height={plotH} className="ov-hit" />
            <circle cx={x(i)} cy={y(b.followers)} r={hover === i ? 5 : n > 60 ? 0 : 3} className="ov-dot" />
          </g>
        ))}
        {buckets.map((b, i) => (i % labelEvery === 0 || i === n - 1) && (
          <text key={`l${i}`} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="ov-axis">{granularity === "month" ? MON[+b.key.slice(5, 7) - 1] : granularity === "year" ? b.key : md(b.end)}</text>
        ))}
        {h && hover != null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + plotH} className="ov-cross" />}
      </svg>
      {h && hover != null && (
        <div className={`ov-tip${x(hover) > W * 0.7 ? " left" : ""}`} style={{ left: `${((x(hover) / W) * 100).toFixed(2)}%` }} role="status">
          <small>{title(h, granularity)}{h.partial ? " · so far" : ""}</small>
          <b>{h.followers.toLocaleString("en-US")} followers</b>
          {h.net != null ? <em className={h.net >= 0 ? "up" : "down"}>{h.net >= 0 ? "+" : ""}{h.net.toLocaleString("en-US")} net vs previous {granularity}</em> : <span>First snapshot in this range</span>}
          {granularity !== "day" && <span>{h.days} snapshot{h.days === 1 ? "" : "s"} in this {granularity}</span>}
        </div>
      )}
    </div>
  );
}
