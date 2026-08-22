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
} from "lucide-react";
import CountUp from "@/components/CountUp";
import type { NicheIntel, PulseRow } from "@/lib/schema";

// Niche intelligence surface: breakout opportunity, niche pulse, rising
// trends, and next actions. All percentages are the AI's market estimates and
// the strip says so; fit signals only render when they were personalized.

const COVERS: Record<string, string> = {
  "Food & Restaurant": "/brand/comp/c1.jpg",
};
const GENERIC_COVERS = [
  "/brand/thumbs/t1.jpg",
  "/brand/thumbs/t2.jpg",
  "/brand/thumbs/t3.jpg",
  "/brand/thumbs/t4.jpg",
];
function coverFor(niche: string): string {
  if (COVERS[niche]) return COVERS[niche];
  let h = 0;
  for (const c of niche) h = (h * 31 + c.charCodeAt(0)) % 997;
  return GENERIC_COVERS[h % GENERIC_COVERS.length];
}

// Deterministic little sparkline: a seeded walk that trends with the signal.
function sparkPoints(seedStr: string, pct: number): string {
  let seed = 7;
  for (const c of seedStr) seed = (seed * 33 + c.charCodeAt(0)) % 2147483647;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const n = 12;
  const W = 72;
  const H = 20;
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

function Spark({ seed, pct }: { seed: string; pct: number }) {
  return (
    <svg viewBox="0 0 72 20" className="nt2-spark" preserveAspectRatio="none" aria-hidden>
      <polyline
        points={sparkPoints(seed, pct)}
        fill="none"
        stroke={pct >= 0 ? "#16a34a" : "#dc2626"}
        strokeWidth="1.5"
        strokeLinejoin="round"
        pathLength={100}
      />
    </svg>
  );
}

const TABS = ["formats", "topics", "hooks"] as const;
type Tab = (typeof TABS)[number];

export default function NicheTrends({ niche }: { niche: string }) {
  const [data, setData] = useState<NicheIntel | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("formats");

  const load = useCallback(
    async (refresh = false) => {
      setLoading(true);
      setErr(null);
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

  if (loading) {
    return (
      <div className="nt2-skel" aria-label="Loading niche intelligence" role="status">
        <div className="nt2-skel-strip">
          {[0, 1, 2, 3].map((i) => <span key={i} />)}
        </div>
        <div className="nt2-skel-hero" />
        <div className="nt2-skel-row">
          {[0, 1, 2].map((i) => <span key={i} />)}
        </div>
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
  const statTiles = [
    { n: String(data.stats.rising_formats), label: "Rising formats", pct: 12 },
    { n: String(data.stats.opportunity_hooks), label: "High-opportunity hooks", pct: 9 },
    { n: String(data.stats.competitor_patterns), label: "Competitor patterns", pct: 6 },
    {
      n: `+${data.stats.momentum_pct}%`,
      label: `Momentum in ${data.stats.momentum_label}`,
      pct: data.stats.momentum_pct,
    },
  ];

  return (
    <div className="nt2">
      {/* intelligence strip */}
      <div className="nt2-strip db2-rise">
        {statTiles.map((s, i) => (
          <div className="nt2-stat" key={s.label} style={{ animationDelay: `${i * 60}ms` }}>
            <div className="nt2-stat-top">
              <b><CountUp value={s.n} /></b>
              <Spark seed={s.label} pct={s.pct} />
            </div>
            <small>{s.label}</small>
          </div>
        ))}
        <div className="nt2-strip-side">
          <span className="nt2-est" title="These signals are SOCIA's AI market estimates, not measured platform data.">
            AI-estimated signals
          </span>
          <button className="nd-mini" onClick={() => load(true)} type="button">
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>

      {/* breakout + side panels */}
      <div className="nt2-main">
        <section className="nt2-hero db2-rise" style={{ animationDelay: "120ms" }}>
          <span className="nt2-eyebrow">Breakout opportunity</span>
          <div className="nt2-hero-grid">
            <div className="nt2-cover">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={coverFor(data.niche)} alt="" />
              <span className="nt2-cover-tag">{b.format.toUpperCase()}</span>
              <b className="nt2-cover-line">{b.cover_line}</b>
              <span className="nt2-cover-play" aria-hidden><Play size={16} fill="currentColor" /></span>
              <em className="nt2-cover-note">Concept preview</em>
            </div>
            <div className="nt2-hero-body">
              <div className="nt2-hero-head">
                <h2>{b.title}</h2>
                <span className="nt2-momentum">
                  ↗ {b.momentum_pct}%<small>est. this week</small>
                </span>
              </div>
              <div className="nt2-block">
                <small>Why it&apos;s moving</small>
                <p>{b.why_moving}</p>
              </div>
              <div className="nt2-block quote">
                <small>Use this angle</small>
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
              {pulseRows.map((r) => (
                <div className="nt2-pulse-row" key={r.label}>
                  <span className="nt2-pulse-label">{r.label}</span>
                  <Spark seed={r.label + tab} pct={r.change_pct} />
                  <b className={r.change_pct >= 0 ? "up" : "down"}>
                    {r.change_pct >= 0 ? "↗" : "↘"} {Math.abs(r.change_pct)}%
                  </b>
                </div>
              ))}
            </div>
          </section>

          <section className="nt2-panel db2-rise" style={{ animationDelay: "280ms" }}>
            <div className="nt2-panel-head">
              <h3>Why SOCIA flagged this</h3>
            </div>
            <div className="nt2-flags">
              <div><span><Zap size={13} /> Velocity</span><b className={b.velocity === "High" ? "hi" : ""}>{b.velocity}</b></div>
              <div><span><Radar size={13} /> Competition</span><b className={b.competition === "Medium" ? "warn" : ""}>{b.competition}</b></div>
              {personalized && (
                <div><span><Target size={13} /> Fit for your account</span><b className="hi">{b.fit_pct}%</b></div>
              )}
              {personalized && (
                <div><span><TrendingUp size={13} /> Audience overlap</span><b>{b.audience_overlap}</b></div>
              )}
              <div><span><Sparkles size={13} /> Estimated opportunity</span><b className={b.opportunity === "High" ? "hi" : ""}>{b.opportunity}</b></div>
            </div>
            {personalized && b.why_fits_you && (
              <div className="nt2-fits">
                <small>Why it fits you</small>
                <p>{b.why_fits_you}</p>
              </div>
            )}
          </section>
        </aside>
      </div>

      {/* rising trends */}
      <h3 className="nt2-h3 db2-rise" style={{ animationDelay: "340ms" }}>
        More rising trends in your niche
      </h3>
      <div className="nt2-trends db2-rise" style={{ animationDelay: "380ms" }}>
        {data.trends.map((t) => (
          <article className="nt2-trend" key={t.title}>
            <div className="nt2-trend-top">
              <span className={`nt2-trend-badge ${t.momentum_pct >= 0 ? "up" : "down"}`}>
                {t.momentum_pct >= 0 ? "↗" : "↘"} {Math.abs(t.momentum_pct)}%
              </span>
            </div>
            <b className="nt2-trend-title">{t.title}</b>
            <p className="nt2-trend-why">{t.why}</p>
            <div className="nt2-trend-hook">
              <small>Hook</small>
              <em>&ldquo;{t.hook}&rdquo;</em>
            </div>
            <Link href="/tool" className="nt2-trend-cta">
              Use this idea <ArrowRight size={12} />
            </Link>
          </article>
        ))}
      </div>

      {/* action strip */}
      <div className="nt2-actions db2-rise" style={{ animationDelay: "440ms" }}>
        <div className="nt2-actions-copy">
          <small>Turn signals into content</small>
          <p>SOCIA found the opportunities. Now turn one into your next post.</p>
        </div>
        <div className="nt2-actions-list">
          {data.actions.map((a, i) => (
            <div className="nt2-action" key={a.title}>
              <span className="nt2-action-num">{String(i + 1).padStart(2, "0")}</span>
              <div className="nt2-action-meta">
                <b>{a.title}</b>
                <small>{a.reason}</small>
              </div>
              <Link href="/tool" className="btn-primary db2-ask sm">
                <Sparkles size={13} /> Build post
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
