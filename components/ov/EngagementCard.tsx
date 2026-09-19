"use client";

// Engagement beyond one percentage: the rate with its formula spelled out,
// what the interactions were made of, and what changed. Every line is a
// comparison of real medians or totals; where Instagram returned nothing the
// row says so.

import { Info } from "lucide-react";
import type { EngagementRate, Breakdown, QualityNote } from "@/lib/engagement";
import { fmtNum } from "@/lib/overview";

export default function EngagementCard({ rate, breakdown, quality, rangeLabel }: { rate: EngagementRate; breakdown: Breakdown; quality: QualityNote[]; rangeLabel: string }) {
  const max = Math.max(1, ...breakdown.parts.map((p) => p.value ?? 0));
  return (
    <div className="eg">
      <div className="eg-top">
        <div className="eg-rate">
          <b>{rate.value != null ? `${rate.value.toFixed(rate.value < 1 ? 2 : 1)}%` : "—"}</b>
          <span>Engagement rate{rate.suffix ? ` ${rate.suffix}` : ""}</span>
          <small className="eg-formula" title={rate.formula}><Info size={11} /> How SOCIA calculates engagement: {rate.formula}.</small>
        </div>
        <div className="eg-total">
          {/* Zero interactions on real posts is a value; only "no posts" is nothing to count. */}
          <b>{breakdown.posts > 0 ? fmtNum(breakdown.total) : "—"}</b>
          <span>Total interactions · {breakdown.posts} post{breakdown.posts === 1 ? "" : "s"} · {rangeLabel.toLowerCase()}</span>
        </div>
      </div>
      <ul className="eg-parts">
        {breakdown.parts.map((p) => (
          <li key={p.id}>
            <span className="eg-part-label">{p.label}</span>
            <span className="eg-track"><i style={{ width: `${p.value != null ? Math.round((p.value / max) * 100) : 0}%` }} /></span>
            <b>{p.value != null ? p.value.toLocaleString("en-US") : "Not available"}</b>
            <small>{p.share != null ? `${Math.round(p.share * 100)}%` : ""}</small>
          </li>
        ))}
      </ul>
      {breakdown.missing > 0 && <p className="ov-source">Saves and shares were not returned for {breakdown.missing} of these posts; they count as not available, not zero.</p>}
      <div className="eg-quality">
        <h3>Engagement quality</h3>
        {quality.length ? (
          <ul>
            {quality.map((q) => (
              <li key={q.id} className={q.tone}>
                <i />
                <span><b>{q.title}</b><small>{q.detail}</small></span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ov-source">Needs at least 4 posts on each side of a comparison (last 5 vs the 5 before) before SOCIA describes a change.</p>
        )}
      </div>
    </div>
  );
}
