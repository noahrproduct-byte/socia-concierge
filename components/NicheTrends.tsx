"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
const COMP_X: Record<string, number> = { Low: 22, Medium: 50, High: 78 };

// ---------------- opportunity map ----------------
// Virtual plot space; rendered with % positions so it stays responsive.
const MW = 880;
const MH = 400;

type MapDot = {
  label: string;
  full: string;
  x: number; // px in virtual space
  y: number;
  r: number;
  hot: boolean;
  momentum: number;
  competition: string;
  why: string;
  idx: number;
};
type Box = { l: number; t: number; r: number; b: number };
const hits = (a: Box, b: Box) =>
  !(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t);

// Greedy label placement: try right/left/above/below (+staggers), never
// overlapping other labels, dots, the zone caption, or the plot edges.
function placeLabels(dots: MapDot[]) {
  const placed: Box[] = [
    { l: 0, t: 0, r: 205, b: 58 }, // zone caption
    { l: MW - 110, t: 0, r: MW, b: 24 }, // CROWDED
    { l: 0, t: MH - 24, r: 110, b: MH }, // EMERGING
    { l: MW - 110, t: MH - 24, r: MW, b: MH }, // SATURATED
    ...dots.map((d) => ({ l: d.x - 10, t: d.y - 10, r: d.x + 10, b: d.y + 10 })),
  ];
  return dots.map((d) => {
    const natural = d.full.length * 6.4 + 10;
    const w = Math.min(150, natural);
    const lines = natural > 150 ? 2 : 1;
    const h = lines * 15 + 16 + (d.hot ? 20 : 0);
    const cands: [number, number, string][] = [
      [d.x + 13, d.y - h / 2, "r"],
      [d.x - 13 - w, d.y - h / 2, "l"],
      [d.x - w / 2, d.y - 15 - h, "a"],
      [d.x - w / 2, d.y + 15, "b"],
      [d.x + 13, d.y + 6, "r"],
      [d.x + 13, d.y - h - 6, "r"],
      [d.x - 13 - w, d.y + 6, "l"],
      [d.x - 13 - w, d.y - h - 6, "l"],
    ];
    let pick: [number, number, string] = cands[0];
    for (const c of cands) {
      const box: Box = { l: c[0], t: c[1], r: c[0] + w, b: c[1] + h };
      const inside = box.l >= 4 && box.r <= MW - 4 && box.t >= 4 && box.b <= MH - 4;
      if (inside && !placed.some((p) => hits(p, box))) {
        pick = c;
        break;
      }
    }
    placed.push({ l: pick[0], t: pick[1], r: pick[0] + w, b: pick[1] + h });
    return { ...d, lx: pick[0], ly: pick[1], lw: w, side: pick[2] };
  });
}

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

  // Build map dots in the virtual plot space, normalized to the actual data
  // range so points use the full height instead of clustering.
  const rawDots: Omit<MapDot, "y" | "x">[] = [];
  const src: { m: number; c: string }[] = [];
  if (COMP_X[b.competition] != null) {
    rawDots.push({
      label: b.title.length > 26 ? b.title.slice(0, 25) + "…" : b.title,
      full: b.title,
      r: 6,
      hot: true,
      momentum: b.momentum_pct,
      competition: b.competition,
      why: b.why_moving,
      idx: -1,
    });
    src.push({ m: b.momentum_pct, c: b.competition });
  }
  mapTrends.forEach((t, i) => {
    rawDots.push({
      label: t.title.length > 26 ? t.title.slice(0, 25) + "…" : t.title,
      full: t.title,
      r: t.momentum_pct >= 25 ? 5 : t.momentum_pct >= 15 ? 4 : 3,
      hot: false,
      momentum: t.momentum_pct,
      competition: t.competition,
      why: t.why,
      idx: i,
    });
    src.push({ m: t.momentum_pct, c: t.competition });
  });
  const mLo = Math.min(...src.map((s) => s.m));
  const mHi = Math.max(...src.map((s) => s.m));
  const mSpan = mHi - mLo || 1;
  const mapDots: MapDot[] = rawDots.map((d, i) => ({
    ...d,
    x: (COMP_X[d.competition] / 100) * MW + ((i * 37) % 5 - 2) * 14,
    y: 0.2 * MH + (1 - (d.momentum - mLo) / mSpan) * 0.58 * MH,
  }));
  const zoneCount = mapDots.filter((d) => d.x < MW / 2 && d.y < MH * 0.49).length;

  // The model sometimes returns a format *description*; the pill wants a word.
  const fmtPill = (() => {
    const f = b.format || "";
    for (const known of ["Reel", "Carousel", "Story", "Short", "Video", "Post"]) {
      if (new RegExp(known, "i").test(f)) return known.toUpperCase();
    }
    return f.length <= 14 ? f.toUpperCase() : "VIDEO";
  })();
  // Guard against a zero momentum headline: fall back to the breakout's.
  const momentumPct = data.stats.momentum_pct > 0 ? data.stats.momentum_pct : b.momentum_pct;

  return (
    <div className="nt2">
      {/* LEVEL 2 preview: the niche signal */}
      <div className="nt2-signal db2-rise">
        <div className="nt2-signal-main">
          <small>Momentum this week</small>
          <div className="nt2-signal-row">
            <b className="nt2-signal-pct">
              +<CountUp value={String(momentumPct)} />%
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
              <span className="nt2-cover-tag">{fmtPill} · CONCEPT</span>
              <span className="nt2-cover-play" aria-hidden><Play size={18} fill="currentColor" /></span>
              <span className="nt2-cover-bottom">
                <b className="nt2-cover-hook">{b.cover_line}</b>
                <span className="nt2-cover-meta">
                  <em>Concept preview</em>
                </span>
              </span>
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
        <OpportunityMap
          dots={mapDots}
          zoneCount={zoneCount}
          personalized={personalized}
          fitPct={b.fit_pct}
          audienceOverlap={b.audience_overlap}
          breakoutWhy={b.why_moving}
        />
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
              <span className="nt2-cover-bottom">
                <b className="nt2-cover-hook">{b.cover_line}</b>
                <span className="nt2-cover-meta">
                  <em>Concept preview · not a real post</em>
                </span>
              </span>
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

// ---------------- the opportunity map ----------------
type Kind = "breakout" | "rising" | "neutral" | "emerging" | "saturated";
const KIND_LABEL: Record<Kind, string> = {
  breakout: "Breakout opportunity",
  rising: "Rising opportunity",
  neutral: "Neutral",
  emerging: "Emerging",
  saturated: "Saturated",
};
function kindOf(d: MapDot, mid: number): Kind {
  if (d.hot) return "breakout";
  if (d.momentum < 0) return "saturated";
  if (d.momentum >= mid) {
    if (d.competition === "High") return "neutral";
    return "rising";
  }
  if (d.competition === "High") return "saturated";
  return "emerging";
}
const momentumWord = (pct: number) =>
  pct < 0 ? "Declining" : pct >= 25 ? "High" : pct >= 12 ? "Medium" : "Low";

function OpportunityMap({
  dots,
  zoneCount,
  personalized,
  fitPct,
  audienceOverlap,
  breakoutWhy,
}: {
  dots: MapDot[];
  zoneCount: number;
  personalized: boolean;
  fitPct: number;
  audienceOverlap: string;
  breakoutWhy: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  const hotIdx = Math.max(0, dots.findIndex((d) => d.hot));
  const [sel, setSel] = useState<number>(hotIdx);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const mid = (Math.min(...dots.map((d) => d.momentum)) + Math.max(...dots.map((d) => d.momentum))) / 2;
  const laid = placeLabels(dots);
  const chosen = laid[sel] ?? laid[hotIdx];
  const chosenKind = kindOf(chosen, mid);
  const ranked = [...laid].sort(
    (a, b2) => (b2.hot ? 1 : 0) - (a.hot ? 1 : 0) || b2.momentum - a.momentum,
  );
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const take = (breakoutWhy.split(/(?<=\.)\s/)[0] || breakoutWhy).slice(0, 160);

  const LEGEND: [Kind, string][] = [
    ["breakout", "Strongest mix of momentum and low competition"],
    ["rising", "Good momentum with favorable competition"],
    ["neutral", "Balanced momentum and competition"],
    ["emerging", "Early signals with room to grow"],
    ["saturated", "High competition or low momentum"],
  ];

  return (
    <section ref={ref} className={`nt2m db2-rise ${inView ? "in" : ""}`} style={{ animationDelay: "420ms" }}>
      <div className="nt2m-head">
        <div>
          <h3>Where the opportunity is moving <TrendingUp size={16} className="nt2m-hico" /></h3>
          <p className="nt2m-insight">
            <b>{zoneCount} {zoneCount === 1 ? "opportunity is" : "opportunities are"}</b> gaining
            momentum faster than competition.
          </p>
        </div>
        <span className="nt2-est">Based on your niche signals</span>
      </div>

      <div className="nt2m-body">
        {/* map */}
        <div className="nt2m-plot" role="img" aria-label="Opportunity map: momentum vs competition">
          <div className="nt2m-zone" aria-hidden />
          <div className="nt2m-zonelabel" aria-hidden>
            <b>Best opportunity zone</b>
            <span>High momentum · Low competition</span>
          </div>
          <span className="nt2m-corner tr" aria-hidden>Crowded</span>
          <span className="nt2m-corner bl" aria-hidden>Emerging</span>
          <span className="nt2m-corner br" aria-hidden>Saturated</span>
          <i className="nt2m-mid v" aria-hidden />
          <i className="nt2m-mid h" aria-hidden />

          {laid.map((d, i) => {
            const kind = kindOf(d, mid);
            return (
              <div
                key={d.full}
                className={`nt2m-pt k-${kind} ${d.hot ? "hot" : ""} ${sel === i ? "sel" : ""}`}
                style={{ ["--d" as string]: `${200 + (d.hot ? laid.length * 70 : i * 70)}ms` }}
              >
                <button
                  className="nt2m-dot"
                  style={{ left: pct(d.x, MW), top: pct(d.y, MH), width: d.r * 2, height: d.r * 2 }}
                  onClick={() => setSel(i)}
                  type="button"
                  aria-pressed={sel === i}
                  aria-label={`${d.full}: ${d.momentum >= 0 ? "+" : ""}${d.momentum}% momentum, ${d.competition} competition`}
                />
                <div
                  className={`nt2m-label s-${d.side}`}
                  style={{ left: pct(d.lx, MW), top: pct(d.ly, MH), width: d.lw }}
                  title={d.full}
                >
                  <span className="nt2m-name">{d.full}</span>
                  <span className={`nt2m-mom ${d.momentum >= 0 ? "" : "neg"}`}>
                    {d.momentum >= 0 ? "+" : ""}{d.momentum}% momentum
                  </span>
                  {d.hot && <span className="nt2m-badge">Breakout</span>}
                </div>
              </div>
            );
          })}

          <div className="nt2m-axes">
            <span>Low competition</span>
            <span className="nt2m-axis-x">← Competition →</span>
            <span>High competition</span>
          </div>
          <span className="nt2m-yaxis">Momentum ↑</span>
        </div>

        {/* detail panel */}
        <aside className="nt2m-detail" key={sel} aria-live="polite">
          <small className={`nt2m-kind k-${chosenKind}`}>{KIND_LABEL[chosenKind]}</small>
          <div className="nt2m-detail-head">
            <h4>{chosen.full}</h4>
            <span className={`nt2m-detail-pct ${chosen.momentum >= 0 ? "" : "neg"}`}>
              {chosen.momentum >= 0 ? "+" : ""}{chosen.momentum}%<small>momentum</small>
            </span>
          </div>
          <div className="nt2m-detail-rows">
            <div>
              <span><TrendingUp size={13} /> Momentum</span>
              <b className={chosen.momentum >= 25 ? "good" : chosen.momentum < 0 ? "bad" : ""}>{momentumWord(chosen.momentum)}</b>
            </div>
            <div>
              <span><Radar size={13} /> Competition</span>
              <b className={chosen.competition === "Low" ? "good" : chosen.competition === "Medium" ? "warn" : ""}>{chosen.competition}</b>
            </div>
            {chosen.hot && personalized && (
              <div>
                <span><Target size={13} /> Fit for your account</span>
                <b className="good">{fitPct}%</b>
              </div>
            )}
            {chosen.hot && audienceOverlap && (
              <div>
                <span><Zap size={13} /> Audience overlap</span>
                <b className={audienceOverlap === "Strong" ? "good" : ""}>{audienceOverlap}</b>
              </div>
            )}
          </div>
          <div className="nt2m-why">
            <small>Why it matters</small>
            <p>{chosen.why}</p>
          </div>
          <Link href="/tool" className="btn-primary db2-ask nt2m-explore">
            Explore opportunity <ArrowRight size={14} />
          </Link>
          <Link href="/chat" className="nt2m-ask">
            Ask the strategist <ArrowRight size={12} />
          </Link>
        </aside>
      </div>

      {/* SOCIA take */}
      <p className="nt2m-take">
        <b>SOCIA take</b> &ldquo;{take}&rdquo;
      </p>

      {/* mobile ranked list */}
      <ol className="nt2m-list">
        {ranked.map((d, i) => {
          const kind = kindOf(d, mid);
          return (
            <li key={d.full}>
              <span className="nt2m-ranknum">{String(i + 1).padStart(2, "0")}</span>
              <span className="nt2m-rankmeta">
                <b>{d.full}</b>
                <small>
                  Momentum {d.momentum >= 0 ? "+" : ""}{d.momentum}% · {d.competition} competition
                  {d.hot && personalized ? ` · Fit ${fitPct}%` : ""}
                </small>
              </span>
              <span className={`nt2m-rankkind k-${kind}`}>{KIND_LABEL[kind].split(" ")[0]}</span>
            </li>
          );
        })}
      </ol>

      {/* legend */}
      <div className="nt2m-legend">
        <div className="nt2m-legend-copy">
          <small>How to read this map</small>
          <span>Top left is ideal: high momentum with low competition.</span>
        </div>
        {LEGEND.map(([kind, desc]) => (
          <div className="nt2m-legend-item" key={kind}>
            <i className={`k-${kind}`} />
            <div>
              <b>{KIND_LABEL[kind]}</b>
              <span>{desc}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
