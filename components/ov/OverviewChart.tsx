"use client";

// The performance chart shared by Dashboard and Analytics. Daily points arrive
// computed from the server; this groups them by day / week / month / year,
// draws a median reference line, keeps breakout buckets visible while fitting
// the scale to the typical range, and explains every bucket in a tooltip.
// Clicking a bucket hands it to the parent for the detail drawer.
// Drawn on app/styles/charts.css at the container's real width; nothing animates.

import "@/app/styles/charts.css";
import { useMemo, useRef, useState } from "react";
import { bucketize, bucketLabel, bucketTitle, detectOutliers, fmtNum, type Series, type Granularity, type Bucket, type Baseline, type PostCard } from "@/lib/overview";
import { moveBucketFocus, useChartWidth } from "./chartSize";

type Props = {
  series: Series;
  granularity?: Granularity;
  showPrevious?: boolean;
  height?: number;
  /** Compact = dashboard density (fewer axis labels). */
  compact?: boolean;
  /** Fit the y-axis to the typical range and cap breakout bars. Default: on when a breakout exists. */
  fitScale?: boolean;
  baseline?: Baseline;
  /** Posts by id, so the tooltip can name what drove a bucket. */
  postById?: Record<string, PostCard>;
  onPick?: (b: Bucket, isOutlier: boolean) => void;
  today?: string;
  /** Draw the final state at once. Charts no longer animate at all, so this is always true in effect; kept for callers. */
  still?: boolean;
};

const GRAN_WORD: Record<Granularity, string> = { day: "day", week: "week", month: "month", year: "year" };
const MINUS = String.fromCharCode(0x2212);

export function driverOf(ids: string[], postById?: Record<string, PostCard>): PostCard | null {
  if (!postById) return null;
  const ps = ids.map((id) => postById[id]).filter((p): p is PostCard => Boolean(p));
  if (!ps.length) return null;
  const haveViews = ps.every((p) => p.views != null);
  return [...ps].sort((a, b) => (haveViews ? b.views! - a.views! : b.engagements - a.engagements))[0];
}

export default function OverviewChart({ series, granularity = "day", showPrevious = true, height = 240, compact = false, fitScale, baseline = null, postById, onPick, today }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const W = useChartWidth(wrap, 720);
  const [hover, setHover] = useState<number | null>(null);
  const [stop, setStop] = useState<number | null>(null);

  const isFollowers = series.metric === "followers";
  const mode = isFollowers ? "last" : "sum";
  const { current, previous } = series;
  const cur = useMemo(() => bucketize(current, granularity, mode, today), [current, granularity, mode, today]);
  const prev = useMemo(() => (showPrevious ? bucketize(previous, granularity, mode, today) : []), [previous, granularity, mode, showPrevious, today]);
  const outliers = useMemo(() => (isFollowers ? new Set<number>() : detectOutliers(cur.map((b) => b.value))), [cur, isFollowers]);
  const fit = fitScale ?? outliers.size > 0;
  // A median post (or typical day) is a daily reference; against a week's or
  // month's total it would mislead, so the line and comparison are daily only.
  const base = granularity === "day" ? baseline : null;

  const n = cur.length;
  const H = height;
  const padL = isFollowers ? 56 : 46, padR = 12, padT = 22, padB = 28;
  const plotW = Math.max(1, W - padL - padR), plotH = H - padT - padB;
  const max = useMemo(() => {
    const vals = cur.map((b, i) => (fit && outliers.has(i) ? null : b.value)).filter((v): v is number => v != null);
    const pvals = prev.map((b) => b.value).filter((v): v is number => v != null);
    let m = Math.max(0, ...vals, ...(fit ? pvals.filter((v) => v <= Math.max(0, ...vals) * 1.5) : pvals));
    if (base && base.value * 1.3 > m) m = base.value * 1.3;
    if (isFollowers) {
      const all = [...vals, ...pvals];
      return all.length ? Math.max(...all) * 1.02 : 1;
    }
    return m > 0 ? m * 1.15 : 1;
  }, [cur, prev, fit, outliers, base, isFollowers]);
  const min = useMemo(() => {
    if (!isFollowers) return 0;
    const all = [...cur, ...prev].map((b) => b.value).filter((v): v is number => v != null);
    return all.length ? Math.min(...all) * 0.98 : 0;
  }, [cur, prev, isFollowers]);
  const y = (v: number) => padT + plotH - ((Math.min(v, max) - min) / (max - min || 1)) * plotH;
  const slot = n ? plotW / n : plotW;
  // Square-ish bars: never wider than 24px, always a hairline of gap between them.
  const barW = Math.max(1, Math.min(24, slot * 0.6));
  const x = (i: number) => padL + i * slot + slot / 2;
  const ticks = 4;
  // One axis label per ~72px of real width, fewer when compact.
  const labelCap = Math.max(2, Math.min(compact ? 7 : granularity === "day" ? 10 : 12, Math.floor(plotW / 72)));
  const labelEvery = Math.max(1, Math.ceil(n / labelCap));
  const empty = series.provenance === "unavailable" || !cur.some((b) => b.value != null);
  // Breakout labels: neighbouring spikes would overprint, so only the tallest
  // one within a label's width gets the text (the tooltip still says breakout).
  const labelReach = Math.ceil(110 / slot);
  const labelOk = (i: number) => {
    const v = cur[i].value ?? 0;
    for (let j = Math.max(0, i - labelReach); j <= Math.min(n - 1, i + labelReach); j++) {
      if (j === i || !outliers.has(j)) continue;
      const w = cur[j].value ?? 0;
      if (w > v || (w === v && j < i)) return false;
    }
    return true;
  };
  const linePts = cur.map((b, i) => (b.value == null ? null : `${x(i)},${y(b.value)}`)).filter(Boolean).join(" ");

  const hovered = hover != null ? cur[hover] : null;
  const hoveredPrev = hover != null ? prev[hover] : null;
  const prevBucket = hover != null && hover > 0 ? cur[hover - 1] : null;
  const change = hovered?.value != null && prevBucket?.value != null && prevBucket.value > 0 ? ((hovered.value - prevBucket.value) / prevBucket.value) * 100 : null;
  const driver = hovered ? driverOf(hovered.postIds, postById) : null;
  const vsBase = hovered?.value != null && base ? hovered.value - base.value : null;
  const unit = series.label.toLowerCase();
  // The one tab stop: the last bucket focused, else the latest bucket.
  const tabStop = stop != null && stop < n ? stop : n - 1;

  return (
    <div ref={wrap} className={`s-chart${empty ? " is-empty" : ""}`} data-metric={series.metric}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="group" aria-label={`${series.label} by ${GRAN_WORD[granularity]}`} className="s-chart-svg">
        <g aria-hidden>
          {Array.from({ length: ticks + 1 }, (_, t) => {
            const v = min + ((max - min) / ticks) * t;
            const gy = y(v);
            return (
              <g key={t}>
                <line x1={padL} x2={W - padR} y1={gy} y2={gy} className="s-chart-grid" />
                <text x={padL - 8} y={gy + 4} textAnchor="end" className="s-chart-axis">{t === 0 && !isFollowers ? "0" : isFollowers ? Math.round(v).toLocaleString("en-US") : fmtNum(Math.round(v))}</text>
              </g>
            );
          })}
          {!empty && prev.map((b, i) => b.value == null || i >= n ? null : (
            <rect key={`p${i}`} x={x(i) - barW / 2} y={y(b.value)} width={barW} height={Math.max(0, padT + plotH - y(b.value))} rx={Math.min(2, barW / 2)} className="s-chart-bar is-prev" />
          ))}
          {!empty && base && !isFollowers && base.value <= max && (
            <g>
              <line x1={padL} x2={W - padR} y1={y(base.value)} y2={y(base.value)} className="s-chart-ref" />
              <text x={W - padR} y={y(base.value) - 5} textAnchor="end" className="s-chart-ref-label">{base.label} {fmtNum(Math.round(base.value))}</text>
            </g>
          )}
        </g>
        {!empty && cur.map((b, i) => {
          const v = b.value ?? 0;
          const capped = fit && outliers.has(i) && v > max;
          const top = y(v);
          const h = Math.max(0, padT + plotH - top);
          const on = hover === i;
          const brk = outliers.has(i);
          const label = `${bucketTitle(b, granularity)}: ${b.value == null ? "no data" : `${fmtNum(b.value)} ${unit}`}${brk ? ", breakout" : ""}${b.partial ? ", so far" : ""}`;
          return (
            <g key={i} data-bucket={i} className="s-chart-focus" tabIndex={i === tabStop ? 0 : -1} role={onPick ? "button" : "img"} aria-label={label}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => { setHover(i); setStop(i); }} onBlur={() => setHover(null)}
              onClick={() => onPick?.(b, brk)}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && onPick) { e.preventDefault(); onPick(b, brk); return; }
                const to = moveBucketFocus(wrap.current, i, e.key, n);
                if (to != null) e.preventDefault();
              }}>
              <rect x={x(i) - slot / 2} y={padT} width={slot} height={plotH} className="s-chart-hit" />
              {b.value != null && !isFollowers && (
                <rect x={x(i) - barW / 2} y={top} width={barW} height={h} rx={Math.min(2, barW / 2)}
                  className={`s-chart-bar${on ? " is-on" : ""}${brk ? " is-breakout" : ""}${b.partial ? " is-partial" : ""}`} />
              )}
              {b.value != null && !isFollowers && capped && (
                <g aria-hidden>
                  <line x1={x(i) - barW / 2 - 3} x2={x(i) + barW / 2 + 3} y1={padT + 8} y2={padT + 4} className="s-chart-cap" />
                  <line x1={x(i) - barW / 2 - 3} x2={x(i) + barW / 2 + 3} y1={padT + 13} y2={padT + 9} className="s-chart-cap" />
                </g>
              )}
              {b.value != null && !isFollowers && brk && labelOk(i) && (
                <text x={x(i)} y={padT - 8} textAnchor="middle" className="s-chart-label" aria-hidden>{fmtNum(b.value)} · breakout</text>
              )}
              {b.value != null && isFollowers && on && <circle cx={x(i)} cy={y(v)} r={4} className="s-chart-dot" />}
            </g>
          );
        })}
        {!empty && isFollowers && linePts && <polyline points={linePts} className="s-chart-line" aria-hidden />}
        <g aria-hidden>
          {cur.map((b, i) => i % labelEvery === 0 && (
            <text key={`l${i}`} x={x(i)} y={H - 8} textAnchor="middle" className="s-chart-axis">{bucketLabel(b, granularity)}</text>
          ))}
          {hovered && hover != null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + plotH} className="s-chart-cross" />}
        </g>
      </svg>
      {hovered && hover != null && (
        <div className={`s-chart-tip${x(hover) > W * 0.7 ? " is-left" : ""}`} style={{ left: Math.round(x(hover)) }} role="status">
          <small>{bucketTitle(hovered, granularity)}{hovered.partial ? " · so far" : ""}</small>
          <b>{hovered.value == null ? "No data" : `${hovered.value.toLocaleString("en-US")} ${unit}`}</b>
          {outliers.has(hover) && <span>Breakout {GRAN_WORD[granularity]}</span>}
          {change != null && <span className={change >= 0 ? "is-good" : "is-bad"}>{change >= 0 ? "+" : ""}{Math.abs(change) >= 100 ? change.toFixed(0) : change.toFixed(1)}% vs previous {GRAN_WORD[granularity]}</span>}
          {vsBase != null && base && hovered.value != null && (
            <span>{vsBase >= 0 ? "+" : MINUS}{fmtNum(Math.abs(Math.round(vsBase)))} vs {base.label.toLowerCase()}{hovered.value / base.value >= 2 ? ` · ${(hovered.value / base.value).toFixed(hovered.value / base.value >= 10 ? 0 : 1)}×` : ""}</span>
          )}
          {granularity !== "day" && baseline && hovered.value != null && <span>{baseline.label}: {fmtNum(Math.round(baseline.value))} {unit}</span>}
          {hoveredPrev?.value != null && <span>Previous period: {fmtNum(hoveredPrev.value)}</span>}
          {!isFollowers && hovered.postIds.length > 0 && <span>{hovered.postIds.length} post{hovered.postIds.length === 1 ? "" : "s"} published</span>}
          {driver && <span>Primary driver: “{driver.title.slice(0, 36)}{driver.title.length > 36 ? "…" : ""}”</span>}
          {onPick && <span>Click to inspect</span>}
        </div>
      )}
      {empty && (
        <div className="s-chart-empty">
          <div>
            <b>No {unit} data for this period</b>
            <p>{series.note}</p>
          </div>
        </div>
      )}
    </div>
  );
}
