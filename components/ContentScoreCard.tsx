"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Info, Zap, Repeat2, Target, Clock, AlignLeft } from "lucide-react";
import CountUp from "@/components/CountUp";
import type { ContentScore } from "@/lib/contentScore";

// The dashboard's visual hero. Every value is CALCULATED from the connected
// account (see lib/contentScore) — no hardcoded scores, and dimensions that
// Instagram's data can't support simply don't appear.
const DIM_ICON: Record<string, typeof Zap> = {
  Engagement: Zap,
  Consistency: Repeat2,
  Reach: Target,
  Timing: Clock,
  Captions: AlignLeft,
};

export default function ContentScoreCard({
  score,
  trend,
}: {
  score: ContentScore | null;
  /** Real score history from daily snapshots; omitted when not yet available. */
  trend?: number[];
}) {
  const ref = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  const [lit, setLit] = useState(false);
  const fine = useRef(false);

  useEffect(() => {
    fine.current =
      window.matchMedia("(pointer: fine)").matches &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  function onMove(e: React.PointerEvent<HTMLElement>) {
    if (!fine.current || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    ref.current.style.setProperty("--lx", `${e.clientX - r.left}px`);
    ref.current.style.setProperty("--ly", `${e.clientY - r.top}px`);
    if (!lit) setLit(true);
  }

  // Trend line only when real score history exists (never a drawn-in curve).
  const W = 220;
  const H = 44;
  const series = trend && trend.length >= 3 ? trend : null;
  const pts = series
    ? series.map((v, i) => {
        const max = Math.max(...series);
        const min = Math.min(...series);
        const span = max - min || 1;
        return `${(i / (series.length - 1)) * W},${H - 4 - ((v - min) / span) * (H - 10)}`;
      })
    : null;

  if (!score) {
    return (
      <section ref={ref} className="db2-score in" aria-label="Content score">
        <div className="db2-score-glow" aria-hidden />
        <div className="db2-score-left">
          <div className="db2-score-title">
            Content Score
            <span title="Calculated from your synced posts once there are at least 5.">
              <Info size={13} />
            </span>
          </div>
          <div className="db2-score-big"><b>—</b></div>
          <p className="db2-score-sub">
            Connect Instagram and publish at least 5 posts — SOCIA scores what it can measure, and
            shows nothing before that.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      ref={ref}
      className={`db2-score ${inView ? "in" : ""} ${lit ? "lit" : ""}`}
      onPointerMove={onMove}
      onPointerLeave={() => setLit(false)}
      aria-label="Content score"
    >
      <div className="db2-score-glow" aria-hidden />

      <div className="db2-score-left">
        <div className="db2-score-title">
          Content Score
          <span title={`Calculated: ${score.method}. Based on your last ${score.sampleSize} synced posts.`}>
            <Info size={13} />
          </span>
        </div>
        <div className="db2-score-big">
          <b>{inView ? <CountUp value={String(score.score)} duration={1100} /> : "0"}</b>
          <span>/100</span>
        </div>
        <div className="db2-score-verdict">{score.verdict}</div>
        <p className="db2-score-sub">
          Calculated from your last {score.sampleSize} synced posts — hover each bar for the formula.
        </p>
        {pts && (
        <svg
          className="db2-score-trend"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            <linearGradient id="db2sg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary-bright)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--primary-bright)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path className="a" d={`M0,${H} L${pts.join(" L")} L${W},${H} Z`} fill="url(#db2sg)" />
          <polyline
            className="l"
            points={pts.join(" ")}
            fill="none"
            stroke="var(--primary-text)"
            strokeWidth="1.8"
            strokeLinejoin="round"
            pathLength={100}
          />
        </svg>
        )}
      </div>

      <div className="db2-score-bars">
        {score.dims.map(({ label, value, method }, i) => {
          const Ico = DIM_ICON[label] ?? Zap;
          return (
          <div className="db2-sbar" key={label} title={`${label}: ${method}`}>
            <span className="db2-sbar-ico"><Ico size={13} /></span>
            <span className="db2-sbar-label">{label}</span>
            <span className="db2-sbar-track">
              <i
                style={{
                  width: inView ? `${value}%` : "0%",
                  transitionDelay: `${200 + i * 110}ms`,
                }}
              />
            </span>
            <b className="db2-sbar-val">{value}</b>
          </div>
          );
        })}
      </div>

      <span className="db2-score-chip" title="Computed by SOCIA from your real posts — not a metric returned by Instagram.">
        <Sparkles size={12} /> SOCIA calculated
      </span>
    </section>
  );
}
