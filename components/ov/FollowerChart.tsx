"use client";

// Follower history: SOCIA's own daily snapshots as a line, grouped by day /
// week / month. A level, never a sum: weekly and monthly points are the count
// at the end of the period, with the net change in the tooltip. The axis
// starts where tracking started; nothing earlier is drawn.
// Drawn on app/styles/charts.css at the container's real width; nothing animates.

import "@/app/styles/charts.css";
import { useMemo, useRef, useState } from "react";
import { bucketFollowers, type FollowerPoint, type FollowerGranularity, type FollowerBucket } from "@/lib/followers";
import { fmtNum } from "@/lib/overview";
import { moveBucketFocus, useChartWidth } from "./chartSize";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const md = (day: string) => `${MON[+day.slice(5, 7) - 1]} ${+day.slice(8, 10)}`;
const full = (day: string) => new Date(day + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const title = (b: FollowerBucket, g: FollowerGranularity) =>
  g === "day" ? full(b.end) : g === "week" ? `Week of ${md(b.start)} · ending ${md(b.end)}` : g === "month" ? new Date(b.key + "-01T00:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) : b.key;

export default function FollowerChart({ points, granularity = "day", height = 200, today, compact = false }: { points: FollowerPoint[]; granularity?: FollowerGranularity; height?: number; today?: string; compact?: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const W = useChartWidth(wrap, 720);
  const [hover, setHover] = useState<number | null>(null);
  const [stop, setStop] = useState<number | null>(null);
  const buckets = useMemo(() => bucketFollowers(points, granularity, today ?? new Date().toISOString().slice(0, 10)), [points, granularity, today]);
  const n = buckets.length;
  if (n < 2) {
    return (
      <div className="s-empty">
        <b>{n === 1 ? "Follower tracking started today." : "No follower snapshots yet."}</b>
        <p>{n === 1 ? `${buckets[0].followers.toLocaleString("en-US")} followers recorded. The line appears once there are two days of history; SOCIA records one snapshot a day from here on.` : "SOCIA records your follower count once a day from the moment an account is connected."}</p>
      </div>
    );
  }
  const H = height, padL = 56, padR = 14, padT = 16, padB = 26;
  const plotW = Math.max(1, W - padL - padR), plotH = H - padT - padB;
  const vals = buckets.map((b) => b.followers);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = Math.max(hi - lo, Math.max(4, Math.round(hi * 0.004)));
  const min = lo - span * 0.25, max = hi + span * 0.25;
  const x = (i: number) => padL + (i / (n - 1)) * plotW;
  const y = (v: number) => padT + plotH - ((v - min) / (max - min)) * plotH;
  const line = buckets.map((b, i) => `${x(i)},${y(b.followers)}`).join(" ");
  const area = `${x(0)},${padT + plotH} ${line} ${x(n - 1)},${padT + plotH}`;
  // Short charts get three gridlines, taller ones four.
  const ticks = H < 140 ? 2 : 3;
  const labelCap = Math.max(2, Math.min(compact ? 5 : 8, Math.floor(plotW / 72)));
  const labelEvery = Math.max(1, Math.ceil(n / labelCap));
  const h = hover != null ? buckets[hover] : null;
  const first = buckets[0];
  const step = plotW / (n - 1);
  const tabStop = stop != null && stop < n ? stop : n - 1;

  return (
    <div ref={wrap} className="s-chart" data-metric="followers">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="group" aria-label={`Followers from ${fmtNum(first.followers)} on ${md(first.end)} to ${fmtNum(buckets[n - 1].followers)} on ${md(buckets[n - 1].end)}`} className="s-chart-svg">
        <g aria-hidden>
          {Array.from({ length: ticks + 1 }, (_, t) => {
            const v = min + ((max - min) / ticks) * t;
            return (
              <g key={t}>
                <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} className="s-chart-grid" />
                <text x={padL - 8} y={y(v) + 4} textAnchor="end" className="s-chart-axis">{Math.round(v).toLocaleString("en-US")}</text>
              </g>
            );
          })}
          <polygon points={area} className="s-chart-area" />
          <polyline points={line} className="s-chart-line" />
        </g>
        {buckets.map((b, i) => (
          <g key={b.key} data-bucket={i} className="s-chart-focus" tabIndex={i === tabStop ? 0 : -1} role="img"
            aria-label={`${title(b, granularity)}: ${b.followers.toLocaleString("en-US")} followers${b.net != null ? `, ${b.net >= 0 ? "+" : ""}${b.net} net` : ""}${b.partial ? ", so far" : ""}`}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => { setHover(i); setStop(i); }} onBlur={() => setHover(null)}
            onKeyDown={(e) => { if (moveBucketFocus(wrap.current, i, e.key, n) != null) e.preventDefault(); }}>
            <rect x={x(i) - step / 2} y={padT} width={step} height={plotH} className="s-chart-hit" />
            {hover === i && <circle cx={x(i)} cy={y(b.followers)} r={4} className="s-chart-dot" />}
          </g>
        ))}
        <g aria-hidden>
          {buckets.map((b, i) => (i % labelEvery === 0 || i === n - 1) && !(i !== n - 1 && n - 1 - i < labelEvery / 2) && (
            <text key={`l${i}`} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="s-chart-axis">{granularity === "month" ? MON[+b.key.slice(5, 7) - 1] : granularity === "year" ? b.key : md(b.end)}</text>
          ))}
          {h && hover != null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + plotH} className="s-chart-cross" />}
        </g>
      </svg>
      {h && hover != null && (
        <div className={`s-chart-tip${x(hover) > W * 0.7 ? " is-left" : ""}`} style={{ left: Math.round(x(hover)) }} role="status">
          <small>{title(h, granularity)}{h.partial ? " · so far" : ""}</small>
          <b>{h.followers.toLocaleString("en-US")} followers</b>
          {h.net != null ? <span className={h.net >= 0 ? "is-good" : "is-bad"}>{h.net >= 0 ? "+" : ""}{h.net.toLocaleString("en-US")} net vs previous {granularity}</span> : <span>First snapshot in this range</span>}
          {granularity !== "day" && <span>{h.days} snapshot{h.days === 1 ? "" : "s"} in this {granularity}</span>}
        </div>
      )}
    </div>
  );
}
