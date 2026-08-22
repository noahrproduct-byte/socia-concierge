"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  RefreshCw,
  Play,
  ArrowRight,
  Sparkles,
  Zap,
  Target,
  Radar,
  TrendingUp,
  X,
} from "lucide-react";
import CountUp from "@/components/CountUp";
import type { NicheIntel, PulseRow } from "@/lib/schema";

// Niche intelligence surface. Hierarchy: what matters now (breakout) → what
// is changing (signal + pulse + rail + map) → what to do (next 3 moves).
// All percentages are the AI's market estimates and the UI says so; fit
// signals render only when the briefing was personalized with real account
// context.

const COVERS: Record<string, string> = {
  "Food & Restaurant": "/brand/comp/c1.jpg",
};
const GENERIC_COVERS = [
  "/brand/thumbs/t1.jpg",
  "/brand/thumbs/t2.jpg",
  "/brand/thumbs/t3.jpg",
  "/brand/thumbs/t4.jpg",
];
const FOOD_THUMBS = [
  "/brand/comp/c2.jpg",
  "/brand/comp/c3.jpg",
  "/brand/comp/c4.jpg",
  "/brand/comp/c1.jpg",
  "/brand/comp/c2.jpg",
];
function coverFor(niche: string): string {
  if (COVERS[niche]) return COVERS[niche];
  let h = 0;
  for (const c of niche) h = (h * 31 + c.charCodeAt(0)) % 997;
  return GENERIC_COVERS[h % GENERIC_COVERS.length];
}
function trendThumb(niche: string, i: number): string {
  if (niche === "Food & Restaurant") return FOOD_THUMBS[i % FOOD_THUMBS.length];
  return GENERIC_COVERS[i % GENERIC_COVERS.length];
}

// Deterministic little sparkline: a seeded walk that trends with the signal.
function sparkPoints(seedStr: string, pct: number, W = 72, H = 20, n = 12): string {
  let seed = 7;
  for (const c of seedStr) seed = (seed * 33 + c.charCodeAt(0)) % 2147483647;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const drift = Math.max(-1, Math.min(1, pct / 30));
  let v = 0.5 - drift * 0.3;
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    v += drift / n + (rnd() - 0.5) * 0.16;
    v = Math.max(0.05, Math.min(0.95, v));
    pts.push(`${(i / (n - 1)) * W},${H - 2 - v * (H - 4)}`);
  }
  return pts.join(" ");
}

function Spark({ seed, pct, big = false }: { seed: string; pct: number; big?: boolean }) {
  const W = big ? 220 : 72;
  const H = big ? 44 : 20;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={big ? "nt2-bigspark" : "nt2-spark"}
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline
        points={sparkPoints(seed, pct, W, H, big ? 20 : 12)}
        fill="none"
        stroke={pct >= 0 ? "#16a34a" : "#dc2626"}
        strokeWidth={big ? 1.8 : 1.5}
        strokeLinejoin="round"
        pathLength={100}
      />
    </svg>
  );
}

const TABS = ["formats", "topics", "hooks"] as const;
type Tab = (typeof TABS)[number];
const COMP_X: Record<string, number> = { Low: 18, Medium: 50, High: 82 };

export default function NicheTrends({ niche }: { niche: string }) {
  const [data, setData] = useState<NicheIntel | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("formats");
  const [selected, setSelected] = useState<number | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [preview, setPreview] = useState(false);

  const load = useCallback(
    async (refresh = false) => {
      setLoading(true);
      setErr(null);
      setSelected(null);
      try {
        const res = await fetch(
          `/api/niche-trends?niche=${encodeURIComponent(niche)}${refresh ? "&refresh=1" : ""}`,
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Couldn't load your niche intelligence.");
        setData(json.data as NicheIntel);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Couldn't load your niche intelligence.");
      } finally {
        setLoading(false);
      }
    },
    [niche],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreview(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);

  if (loading) {
    return (
      <div className="nt2-skel" aria-label="Loading niche intelligence" role="status">
        <div className="nt2-skel-strip" />
        <div className="nt2-skel-hero" />
        <div className="nt2-skel-row" />
        <p className="nt2-skel-note">SOCIA is reading your niche…</p>
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="nt2-error">
        <p>{err ?? "Something went wrong."}</p>
        <button className="btn-primary db2-ask" onClick={() => load(true)} type="button">
          <RefreshCw size={14} /> Try again
        </button>
      </div>
    );
  }

  const b = data.breakout;
  const personalized = b.fit_pct > 0;
  const pulseRows: PulseRow[] = data.pulse[tab] ?? [];
  const moving = pulseRows.filter((r) => r.change_pct >= 0);
  const cooling = pulseRows.filter((r) => r.change_pct < 0);
  const sel = selected != null ? data.trends[selected] : null;
  const mapTrends = data.trends.filter((t) => t.competition && COMP_X[t.competition] != null);
  const cover = coverFor(data.niche);

  const mapDots = [
    ...(COMP_X[b.competition] != null
      ? [{ label: "Breakout", x: COMP_X[b.competition], pct: b.momentum_pct, hot: true }]
      : []),
    ...mapTrends.map((t) => ({
      label: t.title.length > 22 ? t.title.slice(0, 21) + "…" : t.title,
      x: COMP_X[t.competition],
      pct: t.momentum_pct,
      hot: false,
    })),
  ];
  const mapY = (pct: number) => {
    const clamped = Math.max(-25, Math.min(40, pct));
    return 16 + (1 - (clamped + 25) / 65) * 168; // 16..184 in a 220-high plot
  };

  return (
    <div className="nt2">
      {/* LEVEL 2 preview: the niche signal */}
      <div className="nt2-signal db2-rise">
        <div className="nt2-signal-main">
          <small>Momentum this week</small>
          <div className="nt2-signal-row">
            <b className="nt2-signal-pct">
              +<CountUp value={String(data.stats.momentum_pct)} />%
            </b>
            <span className="nt2-signal-what">{data.stats.momentum_label}</span>
          </div>
          <p className="nt2-signal-sub">{data.summary}</p>
        </div>
        <div className="nt2-signal-counts">
          <span>↗ <b>{data.stats.rising_formats}</b> rising formats</span>
          <span>↗ <b>{data.stats.opportunity_hooks}</b> hooks gaining traction</span>
          <span><b>{data.stats.competitor_patterns}</b> competitor patterns detected</span>
        </div>
        <div className="nt2-signal-side">
          <Spark seed={data.stats.momentum_label} pct={data.stats.momentum_pct} big />
          <div className="nt2-signal-foot">
            <span className="nt2-est" title="These signals are SOCIA's AI market estimates, not measured platform data.">
              AI-estimated signals
            </span>
            <button className="nd-mini" onClick={() => load(true)} type="button">
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* LEVEL 1: the breakout */}
      <div className="nt2-main">
        <section className="nt2-hero db2-rise" style={{ animationDelay: "120ms" }}>
          <span className="nt2-eyebrow">Breakout opportunity</span>
          <div className="nt2-hero-grid">
            <button
              className="nt2-cover"
              onClick={() => setPreview(true)}
              type="button"
              aria-label="Open concept preview"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cover} alt="" />
              <span className="nt2-cover-tag">{b.format.toUpperCase()}</span>
              <b className="nt2-cover-line">{b.cover_line}</b>
              <span className="nt2-cover-play" aria-hidden><Play size={16} fill="currentColor" /></span>
              <em className="nt2-cover-note">Concept preview</em>
            </button>
            <div className="nt2-hero-body">
              <div className="nt2-hero-head">
                <h2>{b.title}</h2>
                <span className="nt2-momentum">
                  ↗ {b.momentum_pct}%<small>est. this week</small>
                </span>
              </div>
              <div className="nt2-block">
                <small>SOCIA&apos;s take</small>
                <p>{b.why_moving}</p>
              </div>
              <div className="nt2-block quote">
                <small>Your version</small>
                <p>&ldquo;{b.angle_hook}&rdquo;</p>
              </div>
              <div className="nt2-hero-ctas">
                <Link href="/tool" className="btn-primary db2-ask">
                  <Sparkles size={15} /> Build this post
                </Link>
                <Link href="/chat" className="nt2-secondary">
                  Ask the strategist <ArrowRight size={13} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <aside className="nt2-side">
          <section className="nt2-panel db2-rise" style={{ animationDelay: "200ms" }}>
            <div className="nt2-panel-head">
              <h3>{personalized ? "Why this is your best move" : "Why SOCIA flagged this"}</h3>
            </div>
            <div className="nt2-flags">
              <div><span><Zap size={13} /> Momentum</span><b className={b.velocity === "High" ? "hi" : ""}>{b.velocity}</b></div>
              <div><span><Radar size={13} /> Competition</span><b className={b.competition === "Low" ? "hi" : b.competition === "Medium" ? "warn" : ""}>{b.competition}</b></div>
              {personalized && (
                <div><span><Target size={13} /> Account fit</span><b className="hi">{b.fit_pct}%</b></div>
              )}
              {personalized && (
                <div><span><TrendingUp size={13} /> Audience match</span><b>{b.audience_overlap}</b></div>
              )}
              <div><span><Sparkles size={13} /> Opportunity</span><b className={b.opportunity === "High" ? "hi" : ""}>{b.opportunity}</b></div>
            </div>
            {personalized && b.why_fits_you && (
              <div className={`nt2-fits ${analysisOpen ? "open" : ""}`}>
                <small>Why it fits you</small>
                <p>{b.why_fits_you}</p>
                <button
                  className="nd-mini"
                  onClick={() => setAnalysisOpen((v) => !v)}
                  type="button"
                >
                  {analysisOpen ? "Less" : "See analysis"} <ArrowRight size={11} />
                </button>
              </div>
            )}
          </section>

          <section className="nt2-panel db2-rise" style={{ animationDelay: "280ms" }}>
            <div className="nt2-panel-head">
              <h3>Niche pulse</h3>
            </div>
            <div className="nt2-tabs" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  className={tab === t ? "on" : ""}
                  onClick={() => setTab(t)}
                  type="button"
                >
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <div className="nt2-pulse" key={tab}>
              {moving.length > 0 && <small className="nt2-pulse-group">What&apos;s moving</small>}
              {moving.map((r) => (
                <div className="nt2-pulse-row" key={r.label}>
                  <span className="nt2-pulse-label">{r.label}</span>
                  <Spark seed={r.label + tab} pct={r.change_pct} />
                  <b className="up">↗ {Math.abs(r.change_pct)}%</b>
                </div>
              ))}
              {cooling.length > 0 && <small className="nt2-pulse-group cool">What&apos;s cooling</small>}
              {cooling.map((r) => (
                <div className="nt2-pulse-row" key={r.label}>
                  <span className="nt2-pulse-label">{r.label}</span>
                  <Spark seed={r.label + tab} pct={r.change_pct} />
                  <b className="down">↘ {Math.abs(r.change_pct)}%</b>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {/* LEVEL 2: the rail */}
      <h3 className="nt2-h3 db2-rise" style={{ animationDelay: "340ms" }}>
        More rising trends in your niche
        <span className="nt2-h3-hint">Select one and SOCIA connects it to your account.</span>
      </h3>
      <div className="nt2-trends db2-rise" style={{ animationDelay: "380ms" }}>
        {data.trends.map((t, i) => (
          <button
            className={`nt2-trend ${selected === i ? "on" : ""} ${selected != null && selected !== i ? "dim" : ""}`}
            key={t.title}
            onClick={() => setSelected(selected === i ? null : i)}
            type="button"
            aria-pressed={selected === i}
          >
            <div className="nt2-trend-media">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={trendThumb(data.niche, i)} alt="" loading="lazy" />
              <span className={`nt2-trend-badge ${t.momentum_pct >= 0 ? "up" : "down"}`}>
                {t.momentum_pct >= 0 ? "↗" : "↘"} {Math.abs(t.momentum_pct)}%
              </span>
            </div>
            <b className="nt2-trend-title">{t.title}</b>
            <p className="nt2-trend-why">{t.why}</p>
            {t.competition && <small className="nt2-trend-comp">{t.competition} competition</small>}
          </button>
        ))}
      </div>

      {/* the SOCIA signal moment */}
      {sel && (
        <div className="nt2-chain" aria-live="polite">
          <div className="nt2-chain-node">
            <small>Trend</small>
            <b>{sel.title}</b>
            <em className="up">↗ {Math.abs(sel.momentum_pct)}% est.</em>
          </div>
          <span className="nt2-chain-arrow" aria-hidden>→</span>
          <div className="nt2-chain-node">
            <small>Why it&apos;s working</small>
            <p>{sel.why}</p>
          </div>
          <span className="nt2-chain-arrow" aria-hidden>→</span>
          <div className="nt2-chain-node">
            <small>Your version</small>
            <p className="nt2-chain-hook">&ldquo;{sel.hook}&rdquo;</p>
          </div>
          <span className="nt2-chain-arrow" aria-hidden>→</span>
          <div className="nt2-chain-node cta">
            <Link href="/tool" className="btn-primary db2-ask">
              <Sparkles size={14} /> Build this post
            </Link>
          </div>
        </div>
      )}

      {/* opportunity map */}
      {mapDots.length >= 3 && (
        <section className="nt2-map db2-rise" style={{ animationDelay: "420ms" }}>
          <div className="nt2-panel-head">
            <h3>Where the opportunity is moving</h3>
            <span className="nt2-est">AI-estimated position</span>
          </div>
          <div className="nt2-map-plot">
            <svg viewBox="0 0 640 220" preserveAspectRatio="none" aria-label="Opportunity map: momentum vs competition">
              <rect x="8" y="8" width="300" height="100" rx="10" className="nt2-map-sweet" />
              <text x="20" y="28" className="nt2-map-sweetlabel">High momentum · Low competition</text>
              {[55, 110, 165].map((y) => (
                <line key={y} x1="0" y1={y} x2="640" y2={y} className="nt2-map-grid" />
              ))}
              {mapDots.map((d) => {
                const x = (d.x / 100) * 640;
                const y = mapY(d.pct);
                const left = d.x > 60;
                return (
                  <g key={d.label}>
                    <circle cx={x} cy={y} r={d.hot ? 5 : 3.5} className={d.hot ? "nt2-map-dot hot" : "nt2-map-dot"} />
                    <text
                      x={left ? x - 9 : x + 9}
                      y={y + 3.5}
                      textAnchor={left ? "end" : "start"}
                      className={d.hot ? "nt2-map-label hot" : "nt2-map-label"}
                    >
                      {d.label}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div className="nt2-map-axes">
              <span>Low competition</span>
              <span>High competition</span>
            </div>
            <span className="nt2-map-yaxis">Momentum ↑</span>
          </div>
        </section>
      )}

      {/* LEVEL 3: next moves */}
      <section className="nt2-moves db2-rise" style={{ animationDelay: "460ms" }}>
        <div className="nt2-moves-head">
          <h3>Your next 3 moves</h3>
          <p>
            {personalized
              ? "Based on your content, audience, and current niche momentum."
              : "Based on current niche momentum."}
          </p>
        </div>
        {data.actions.map((a, i) => (
          <div className="nt2-move" key={a.title}>
            <span className="nt2-action-num">{String(i + 1).padStart(2, "0")}</span>
            <div className="nt2-move-meta">
              <b>{a.title}</b>
              <small>{a.reason}</small>
            </div>
            {a.impact && <span className="nt2-move-impact">{a.impact}</span>}
            <Link href="/tool" className="btn-primary db2-ask sm">
              <Sparkles size={13} /> Build post
            </Link>
          </div>
        ))}
      </section>

      {/* concept preview modal */}
      {preview && (
        <div className="nt2-modal" role="dialog" aria-modal="true" aria-label="Concept preview" onClick={() => setPreview(false)}>
          <div className="nt2-modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="nt2-modal-x" onClick={() => setPreview(false)} type="button" aria-label="Close preview">
              <X size={16} />
            </button>
            <div className="nt2-modal-cover">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cover} alt="" />
              <b>{b.cover_line}</b>
              <em>Concept preview · not a real post</em>
            </div>
            <div className="nt2-modal-body">
              <h3>{b.title}</h3>
              <p>&ldquo;{b.angle_hook}&rdquo;</p>
              <Link href="/tool" className="btn-primary db2-ask">
                <Sparkles size={14} /> Build this post
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
