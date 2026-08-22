"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Info, Zap, Repeat2, Target, Clock } from "lucide-react";
import CountUp from "@/components/CountUp";

// The dashboard's visual hero: a dark intelligence panel showing the overall
// content score with the five sub-scores the AI grades every post on.
// Bars animate in when the panel becomes visible; on pointer-fine devices a
// very faint blue light follows the cursor across the surface.
const SCORE = 87;
const VERDICT = "Great";
const TREND = [68, 71, 70, 74, 77, 79, 78, 82, 85, 87];
const BARS = [
  { label: "Hook", value: 92, Ico: Zap },
  { label: "Retention", value: 85, Ico: Repeat2 },
  { label: "Relevance", value: 88, Ico: Target },
  { label: "Originality", value: 78, Ico: Sparkles },
  { label: "Timing", value: 90, Ico: Clock },
];

export default function ContentScoreCard() {
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

  // Trend area path (drawn when the panel enters).
  const W = 220;
  const H = 44;
  const max = Math.max(...TREND);
  const min = Math.min(...TREND);
  const span = max - min || 1;
  const pts = TREND.map(
    (v, i) => `${(i / (TREND.length - 1)) * W},${H - 4 - ((v - min) / span) * (H - 10)}`,
  );

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
          <span title="The AI grades every post before it goes out."><Info size={13} /></span>
        </div>
        <div className="db2-score-big">
          <b>{inView ? <CountUp value={String(SCORE)} duration={1100} /> : "0"}</b>
          <span>/100</span>
        </div>
        <div className="db2-score-verdict">{VERDICT}</div>
        <p className="db2-score-sub">Your last 30 posts, graded by the AI before they went out.</p>
        <svg
          className="db2-score-trend"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            <linearGradient id="db2sg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4c86ff" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#4c86ff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path className="a" d={`M0,${H} L${pts.join(" L")} L${W},${H} Z`} fill="url(#db2sg)" />
          <polyline
            className="l"
            points={pts.join(" ")}
            fill="none"
            stroke="#6ea0ff"
            strokeWidth="1.8"
            strokeLinejoin="round"
            pathLength={100}
          />
        </svg>
        <span className="db2-score-delta">↗ 14 pts vs prev 30 posts</span>
      </div>

      <div className="db2-score-bars">
        {BARS.map(({ label, value, Ico }, i) => (
          <div className="db2-sbar" key={label}>
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
        ))}
      </div>

      <span className="db2-score-chip">
        <Sparkles size={12} /> AI graded
      </span>
    </section>
  );
}
