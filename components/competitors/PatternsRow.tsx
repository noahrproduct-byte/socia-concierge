"use client";

// Content patterns (format / themes / hooks / style), top themes, and what to
// learn from the selected competitor. Every bar is a share of the posts SOCIA
// read; the sample size is always on screen.

import { useState } from "react";
import Link from "next/link";
import { Info, Link2 } from "lucide-react";
import type { CompetitorRow, GroupedPatterns, Learning, PatternRow } from "@/lib/competitorIntel";

type Tab = "format" | "themes" | "hooks" | "style";
const TABS: [Tab, string][] = [["format", "Format"], ["themes", "Themes"], ["hooks", "Hooks"], ["style", "Style"]];

function gateText(r: CompetitorRow): string {
  switch (r.postsGate) {
    case "connection_needed": return `Their posts need a linked Facebook Page to read. Instagram shares them only through Business Discovery.`;
    case "not_business": return `Instagram only publishes posts for public Business and Creator accounts; ${r.name} is personal or private.`;
    case "not_found": return `The platform returned no account for @${r.handle}.`;
    case "no_permission": return "Reconnect Facebook to grant Instagram access (instagram_basic).";
    case "failed": return "The platform could not be reached just now.";
    default: return r.platform === "facebook" ? "Facebook publishes nothing about Pages you don't manage." : "No posts read for this account yet.";
  }
}

function Bars({ rows, empty }: { rows: PatternRow[]; empty: string }) {
  if (!rows.length) return <p className="cx-empty small">{empty}</p>;
  return (
    <ul className="cx-bars">
      {rows.slice(0, 5).map((p) => (
        <li key={p.tag} title={`${p.count} of ${p.total} posts${p.medianMultiplier != null ? ` · median ${p.medianMultiplier.toFixed(1)}× their own baseline` : ""}`}>
          <span className="cx-bar-label">{p.tag}</span>
          <span className="cx-bar"><i style={{ width: `${Math.max(3, p.share)}%` }} /></span>
          <b>{p.share}%</b>
        </li>
      ))}
    </ul>
  );
}

export function Patterns({ r, patterns }: { r: CompetitorRow | null; patterns: GroupedPatterns | null }) {
  const [tab, setTab] = useState<Tab>("format");
  const rows = patterns ? patterns[tab] : [];
  const EMPTY: Record<Tab, string> = {
    format: "The platform did not report a format for these posts.",
    themes: "No theme repeats across their recent titles.",
    hooks: "No hook structure repeats across their recent titles.",
    style: "No presentation signal repeats across their recent titles.",
  };
  return (
    <section className="ov-card cx-patterns">
      <div className="ov-card-head"><h2>Content patterns</h2></div>
      <div className="ov-seg cx-tabs" role="tablist" aria-label="Pattern type">
        {TABS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {!r ? <p className="cx-empty small">Select a competitor to analyse their posts.</p>
        : !patterns || patterns.insufficient ? (
          <div className="cx-empty small">
            {r.posts.length === 0 ? <p><Link2 size={12} /> {gateText(r)}{r.postsGate === "connection_needed" && <> <Link href="/api/auth/facebook/start" className="ov-link">Connect</Link></>}</p>
              : <p>Not enough posts to call a pattern: {r.posts.length} read, {patterns?.minSample ?? 5} needed.</p>}
          </div>
        ) : <Bars rows={rows} empty={EMPTY[tab]} />}
      {patterns && !patterns.insufficient && (
        <small className="cx-sample"><Info size={11} /> Based on their last {patterns.total} posts{tab === "format" ? ", as the platform reports them" : ", from titles and captions"}</small>
      )}
    </section>
  );
}

export function Themes({ r, patterns }: { r: CompetitorRow | null; patterns: GroupedPatterns | null }) {
  return (
    <section className="ov-card cx-themes">
      <div className="ov-card-head"><h2>Top themes</h2></div>
      {!r ? <p className="cx-empty small">Select a competitor.</p>
        : !patterns || patterns.insufficient ? <p className="cx-empty small">{r.posts.length === 0 ? gateText(r) : `Needs at least ${patterns?.minSample ?? 5} posts; ${r.posts.length} read.`}</p>
        : <Bars rows={patterns.themes} empty="No subject repeats across their recent titles, so no theme is claimed." />}
      {patterns && !patterns.insufficient && <small className="cx-sample"><Info size={11} /> Share of their last {patterns.total} posts whose title shows the theme. Frequency, not performance.</small>}
    </section>
  );
}

export function Learn({ r, items, onIdeas, onExamples }: { r: CompetitorRow | null; items: Learning[]; onIdeas: (q: string) => void; onExamples: (tag: string | null, title: string) => void }) {
  return (
    <section className="ov-card cx-learn">
      <div className="ov-card-head"><h2>What you can learn{r ? ` from them` : ""}</h2></div>
      {items.length ? (
        <ol className="cx-learn-list">
          {items.map((l) => (
            <li key={l.n}>
              <span className="cx-learn-n">{l.n}</span>
              <span className="cx-learn-body"><b>{l.title}</b><small>{l.observed}</small></span>
              {l.action.kind === "plan" && <Link href={`/tool?note=${encodeURIComponent(l.action.note)}`} className="ov-btn outline small">{l.action.label}</Link>}
              {l.action.kind === "ideas" && <button type="button" className="ov-btn outline small" onClick={() => onIdeas(l.action.kind === "ideas" ? l.action.question : "")}>{l.action.label}</button>}
              {l.action.kind === "examples" && <button type="button" className="ov-btn outline small" onClick={() => onExamples(l.action.kind === "examples" ? l.action.tag : null, l.title)}>{l.action.label}</button>}
            </li>
          ))}
        </ol>
      ) : (
        <div className="cx-empty">
          <p>{!r ? "Select a competitor." : "Recommendations appear once a comparison shows a measurable gap or their posts show a repeated pattern. Nothing generic is offered."}</p>
        </div>
      )}
    </section>
  );
}
