"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Flame, TrendingUp, Minus } from "lucide-react";
import type { NicheTrends as Trends } from "@/lib/schema";

function MomentumBadge({ m }: { m: string }) {
  const key = m.toLowerCase();
  const Icon = key === "hot" ? Flame : key === "rising" ? TrendingUp : Minus;
  return (
    <span className={`momentum ${key}`}>
      <Icon size={12} /> {m}
    </span>
  );
}

export default function NicheTrends({ niche }: { niche: string }) {
  const [data, setData] = useState<Trends | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(
          `/api/niche-trends?niche=${encodeURIComponent(niche)}${refresh ? "&refresh=1" : ""}`,
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Couldn't load trends.");
        setData(json.data as Trends);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Couldn't load trends.");
      } finally {
        setLoading(false);
      }
    },
    [niche],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  if (loading && !data) {
    return (
      <div className="nt-loading">
        <div className="spinner" />
        <p>Analyzing what&apos;s working in {niche}…</p>
        <span>The AI is scanning formats, hooks, and concepts — about 30s the first time.</span>
      </div>
    );
  }

  if (err && !data) {
    return (
      <div className="authmsg err" style={{ maxWidth: 520 }}>
        {err}{" "}
        <button className="linkbtn" style={{ width: "auto", display: "inline" }} onClick={() => load(false)}>
          Try again
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <>
      <div className="nt-summary">
        <div>
          <span className="nt-summary-label">What&apos;s hot in {data.niche}</span>
          <p>{data.summary}</p>
        </div>
        <button className="pill-btn" onClick={() => load(true)} disabled={loading}>
          <RefreshCw size={14} /> {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="nt-grid">
        {data.trends.map((t, i) => (
          <div className="nt-card" key={i}>
            <div className="nt-card-top">
              <span className="tag fmt">{t.format}</span>
              <MomentumBadge m={t.momentum} />
            </div>
            <h3>{t.title}</h3>
            <p className="nt-why">{t.whyItWorks}</p>
            <div className="nt-hook">
              <b>Hook</b>
              {t.exampleHook}
            </div>
          </div>
        ))}
      </div>

      <div className="panel-grid">
        <section className="chart-card">
          <div className="chart-head">
            <h3>Top hook patterns</h3>
          </div>
          <ul className="nt-hooks">
            {data.topHooks.map((h, i) => (
              <li key={i}>
                <span className="nt-hook-n">{i + 1}</span>
                {h}
              </li>
            ))}
          </ul>
        </section>
        <section className="chart-card">
          <div className="chart-head">
            <h3>Winning formats</h3>
          </div>
          <ul className="nt-formats">
            {data.formats.map((f, i) => (
              <li key={i}>
                <b>{f.name}</b>
                <small>{f.note}</small>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
