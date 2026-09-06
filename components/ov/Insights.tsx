"use client";

// Evidence-based insights. Every item was computed from the account's own
// numbers (lib/overview.buildInsights); clicking one opens the evidence with
// observed data, SOCIA's interpretation and a recommendation kept apart.

import { useState } from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown, MapPin, Clock, Sparkles, ChevronRight, Info, Film, AlertTriangle } from "lucide-react";
import Drawer from "./Drawer";
import type { Insight, PostCard } from "@/lib/overview";

const ICON = {
  outlier: TrendingUp, format: Film, location: MapPin, window: Clock, cadence: AlertTriangle, trend: TrendingUp,
} as const;

export function InsightList({ insights, numbered = false, posts = [], compact = false }: { insights: Insight[]; numbered?: boolean; posts?: PostCard[]; compact?: boolean }) {
  const [open, setOpen] = useState<Insight | null>(null);
  if (!insights.length) {
    return <div className="ov-empty small">Not enough posts yet for SOCIA to say anything it can back up. Insights appear after five dated posts.</div>;
  }
  const evidence = open ? posts.filter((p) => open.postIds.includes(p.id)) : [];
  return (
    <>
      <ul className={`ov-insights${compact ? " compact" : ""}`}>
        {insights.map((it, i) => {
          const Icon = it.kind === "trend" && it.tone === "down" ? TrendingDown : ICON[it.kind];
          return (
            <li key={it.id}>
              <button type="button" className="ov-insight" onClick={() => setOpen(it)}>
                {numbered ? <span className="ov-insight-num">{i + 1}</span> : <span className={`ov-insight-ico ${it.tone}`}><Icon size={14} /></span>}
                <span className="ov-insight-body">
                  <b>{it.title}</b>
                  <small>{it.body}</small>
                </span>
                <ChevronRight size={14} className="ov-insight-chev" />
              </button>
            </li>
          );
        })}
      </ul>
      <Drawer open={Boolean(open)} title="Insight evidence" onClose={() => setOpen(null)}>
        {open && (
          <>
            <h3 className="ov-drawer-title">{open.title}</h3>
            <div className="ov-why-block"><small>Observed data</small><ul>{open.observed.map((o) => <li key={o}>{o}</li>)}</ul></div>
            <div className="ov-why-block ai"><small>AI interpretation</small><p>{open.interpretation}</p></div>
            <div className="ov-why-block rec"><small>Recommendation</small><p>{open.recommendation}</p></div>
            {evidence.length > 0 && (
              <div className="ov-evidence">
                <small>Relevant content</small>
                {evidence.map((p) => (
                  <a key={p.id} href={p.permalink ?? "#"} target="_blank" rel="noreferrer" className="ov-evidence-row">
                    {p.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.thumb} alt="" width={40} height={40} />
                    ) : <span className="ov-card-ph" />}
                    <span><b>{p.title}</b><em>{p.engagements.toLocaleString("en-US")} engagements{p.views != null ? ` · ${p.views.toLocaleString("en-US")} views` : ""}</em></span>
                  </a>
                ))}
              </div>
            )}
            <div className="ov-detail-actions">
              <Link href={`/tool?note=${encodeURIComponent(open.planNote)}`} className="ov-btn primary"><Sparkles size={13} /> Add to Content Plan</Link>
              <Link href={`/chat?q=${encodeURIComponent(`${open.title}. ${open.body} What should I do about it this week?`)}`} className="ov-btn ghost"><Info size={13} /> Ask the Strategist</Link>
            </div>
          </>
        )}
      </Drawer>
    </>
  );
}
