"use client";

// Evidence-based insights. Every item was computed from the account's own
// numbers (lib/overview.buildInsights); clicking one opens the evidence with
// observed data, SOCIA's interpretation and a recommendation kept apart.
// The Dashboard renders this list too, so it brings its own stylesheet.

import "@/app/(app)/analytics/analytics.css";
import { useState } from "react";
import { TrendingUp, TrendingDown, MapPin, Clock, Sparkles, ChevronRight, Info, Film, AlertTriangle, ArrowRight, ImageOff } from "lucide-react";
import Drawer from "./Drawer";
import { Button, ButtonLink, Empty } from "@/components/system";
import type { Insight, PostCard } from "@/lib/overview";

const ICON = {
  outlier: TrendingUp, format: Film, location: MapPin, window: Clock, cadence: AlertTriangle, trend: TrendingUp,
} as const;

const TONE: Record<Insight["tone"], string | undefined> = { up: "is-good", down: "is-bad", warn: "is-warn", info: undefined };

type Tab = "content" | "audience" | "times" | "growth";

export function InsightList({ insights, numbered = false, posts = [], compact = false, onTab }: { insights: Insight[]; numbered?: boolean; posts?: PostCard[]; compact?: boolean; onTab?: (t: Tab) => void }) {
  const [open, setOpen] = useState<Insight | null>(null);
  if (!insights.length) {
    return <Empty>Not enough posts yet for SOCIA to say anything it can back up. Insights appear after five dated posts.</Empty>;
  }
  const evidence = open ? posts.filter((p) => open.postIds.includes(p.id)) : [];
  return (
    <>
      <div className="an-list">
        {insights.map((it, i) => {
          const Icon = it.kind === "trend" && it.tone === "down" ? TrendingDown : ICON[it.kind];
          return (
            <button key={it.id} type="button" className={TONE[it.tone] ? `an-row ${TONE[it.tone]}` : "an-row"} onClick={() => setOpen(it)}>
              {numbered ? <span className="an-gap-rank">{String(i + 1).padStart(2, "0")}</span> : <Icon aria-hidden />}
              <span className="an-row-body">
                <b>{it.title}</b>
                {!compact && <small>{it.body}</small>}
                <small>
                  {it.tag} · {it.action.label}
                </small>
              </span>
              <span className="an-row-end">
                <ChevronRight size={16} aria-hidden />
              </span>
            </button>
          );
        })}
      </div>
      <Drawer open={Boolean(open)} title="Insight evidence" onClose={() => setOpen(null)}>
        {open && (
          <>
            <p className="s-hint">{open.tag}</p>
            <h3 className="s-section-title">{open.title}</h3>
            <div className="an-why">
              <div className="an-why-block">
                <small>Observed data</small>
                <ul>{open.observed.map((o) => <li key={o}>{o}</li>)}</ul>
              </div>
              <div className="an-why-block is-read">
                <small>SOCIA&apos;s interpretation</small>
                <p>{open.interpretation}</p>
              </div>
              <div className="an-why-block">
                <small>Recommendation</small>
                <p>{open.recommendation}</p>
              </div>
              {evidence.length > 0 && (
                <div className="an-why-block">
                  <small>Relevant content</small>
                  <div className="an-list">
                    {evidence.map((p) => (
                      <a key={p.id} href={p.permalink ?? "#"} target="_blank" rel="noreferrer" className="an-row">
                        {p.thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.thumb} alt="" width={40} height={40} className="an-thumb" />
                        ) : (
                          <span className="an-thumb an-avatar is-ph" aria-hidden><ImageOff /></span>
                        )}
                        <span className="an-row-body">
                          <b>{p.title}</b>
                          <small>
                            {p.engagements.toLocaleString("en-US")} interactions{p.views != null ? ` · ${p.views.toLocaleString("en-US")} views` : ""}
                          </small>
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="an-actions">
              <ButtonLink href={`/tool?note=${encodeURIComponent(open.planNote)}`} variant="primary" size="sm">
                <Sparkles aria-hidden /> Add to Content Plan
              </ButtonLink>
              {open.action.tab && onTab && (
                <Button size="sm" onClick={() => { onTab(open.action.tab!); setOpen(null); }}>
                  <ArrowRight aria-hidden /> {open.action.label}
                </Button>
              )}
              <ButtonLink
                href={`/chat?q=${encodeURIComponent(`${open.title}. ${open.body} What should I do about it this week?`)}`}
                variant="ghost"
                size="sm"
                data-ask-context={JSON.stringify({ postId: open.postIds[0] })}
                data-ask-label={open.tag}
                data-ask-send="1"
              >
                <Info aria-hidden /> Ask SOCIA
              </ButtonLink>
            </div>
          </>
        )}
      </Drawer>
    </>
  );
}
