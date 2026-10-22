"use client";

// Engagement beyond one percentage: the rate with its formula spelled out,
// what the interactions were made of, and what changed. Every line is a
// comparison of real medians or totals; where Instagram returned nothing the
// row says so.

import "@/app/styles/charts.css";
import "@/app/(app)/analytics/analytics.css";
import { Info, Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { EngagementRate, Breakdown, QualityNote } from "@/lib/engagement";
import { fmtNum } from "@/lib/overview";
import { CardSource } from "@/components/system";

const DASH = String.fromCharCode(0x2014);
const QUALITY: Record<QualityNote["tone"], { cls?: string; Icon: typeof Info }> = {
  up: { cls: "is-good", Icon: TrendingUp },
  down: { cls: "is-bad", Icon: TrendingDown },
  flat: { Icon: Minus },
  info: { Icon: Info },
};

export default function EngagementCard({ rate, breakdown, quality, rangeLabel }: { rate: EngagementRate; breakdown: Breakdown; quality: QualityNote[]; rangeLabel: string }) {
  const max = Math.max(1, ...breakdown.parts.map((p) => p.value ?? 0));
  return (
    <div>
      <div className={rate.value == null ? "an-stat is-na" : "an-stat"}>
        <b>{rate.value != null ? `${rate.value.toFixed(rate.value < 1 ? 2 : 1)}%` : DASH}</b>
        <span>Engagement rate{rate.suffix ? ` ${rate.suffix}` : ""}</span>
      </div>
      <p className="s-hint">How SOCIA calculates engagement: {rate.formula}.</p>

      <div className="an-why">
        <div className={breakdown.total ? "an-stat" : "an-stat is-na"}>
          <b>{breakdown.total ? fmtNum(breakdown.total) : DASH}</b>
          <span>
            Total interactions · {breakdown.posts} post{breakdown.posts === 1 ? "" : "s"} · {rangeLabel.toLowerCase()}
          </span>
        </div>
        <ul className="s-bars">
          {breakdown.parts.map((p) => (
            <li key={p.id} className={p.value == null ? "is-thin" : undefined}>
              <span>{p.label}</span>
              <span className="s-bars-track" aria-hidden>
                <i style={{ width: `${p.value != null ? Math.round((p.value / max) * 100) : 0}%` }} />
              </span>
              {p.value != null ? (
                <b>
                  {p.value.toLocaleString("en-US")}
                  {p.share != null && <small>{Math.round(p.share * 100)}%</small>}
                </b>
              ) : (
                <span className="s-na">Not available</span>
              )}
            </li>
          ))}
        </ul>
        {breakdown.missing > 0 && <CardSource>Saves and shares were not returned for {breakdown.missing} of these posts; they count as not available, not zero.</CardSource>}
      </div>

      <div className="an-why">
        <h3>Engagement quality</h3>
        {quality.length ? (
          <ul className="an-list">
            {quality.map((q) => {
              const { cls, Icon } = QUALITY[q.tone];
              return (
                <li key={q.id} className={cls}>
                  <Icon aria-hidden />
                  <span className="an-row-body">
                    <b>{q.title}</b>
                    <small>{q.detail}</small>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <CardSource>Needs at least 4 posts on each side of a comparison (last 5 vs the 5 before) before SOCIA describes a change.</CardSource>
        )}
      </div>
    </div>
  );
}
