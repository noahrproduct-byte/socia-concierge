"use client";

// The intelligence strip: five verdicts SOCIA can defend, in one glance.
// Every cell is real (rank among published engagement rates, the composite
// score over your own metrics, snapshot momentum, the picked threat, the top
// counted opportunity) — and any cell whose input is absent says so instead
// of showing an invented number.

import { TrendingDown, TrendingUp } from "lucide-react";
import type { PerformanceScore } from "@/lib/competitorScore";
import { CountNum } from "./viz";

export type IntelCells = {
  rank: { rank: number; of: number } | null;
  score: PerformanceScore;
  /** Net follower change over the range; null when snapshots are missing. */
  momentum: number | null;
  days: number;
  threat: { name: string; leads: number } | null;
  opportunity: string | null;
  connected: boolean;
};

function Cell({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="cx2-intel-cell" title={hint}>
      <span className="cx2-micro">{label}</span>
      <div className="cx2-intel-val">{children}</div>
    </div>
  );
}

export default function IntelStrip({ c }: { c: IntelCells }) {
  const none = <b className="none">—</b>;
  return (
    <section className="cx2-intel" aria-label="SOCIA intelligence summary">
      <i className="cx2-scan" aria-hidden />
      <div className="cx2-intel-brand">
        <span className="cx2-pulse" aria-hidden><i /><i /><i /></span>
        <span className="cx2-micro strong">SOCIA INTELLIGENCE</span>
      </div>

      <Cell label="Competitive position" hint={c.rank ? "Your engagement rate ranked against every account on this page that publishes one." : "Needs your engagement rate plus at least one competitor with a published rate."}>
        {c.rank ? <><b>#<CountNum to={c.rank.rank} /></b><small>of {c.rank.of}</small></> : none}
      </Cell>

      <Cell label="Performance score" hint={c.score.overall != null ? `Computed from ${c.score.basis} of your real metrics against published 2026 benchmarks.` : c.connected ? "Needs at least two computable metrics — they fill in as data syncs." : "Connect Instagram to compute this."}>
        {c.score.overall != null ? <><b><CountNum to={c.score.overall} /></b><small>/100</small></> : none}
      </Cell>

      <Cell label="Momentum" hint={c.momentum != null ? `Net follower change over the last ${c.days} days, from SOCIA's daily snapshots.` : "Daily snapshots build this after you connect — nothing is estimated meanwhile."}>
        {c.momentum != null ? (
          <span className={`cx2-mom ${c.momentum >= 0 ? "up" : "down"}`}>
            {c.momentum >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
            <b>{c.momentum >= 0 ? "+" : "−"}<CountNum to={Math.abs(c.momentum)} /></b>
            <small>followers</small>
          </span>
        ) : none}
      </Cell>

      <Cell label="Biggest threat" hint={c.threat ? `Most similar account that measurably leads you on ${c.threat.leads} metric${c.threat.leads === 1 ? "" : "s"}.` : "No tracked account currently leads you on a comparable metric."}>
        {c.threat ? <b className="cx2-intel-name" title={c.threat.name}>{c.threat.name}</b> : none}
      </Cell>

      <Cell label="Opportunity" hint={c.opportunity ? "The top action from the counted patterns below." : "Appears once a comparison shows a measurable gap."}>
        {c.opportunity ? <b className="cx2-intel-name">{c.opportunity}</b> : none}
      </Cell>
    </section>
  );
}
