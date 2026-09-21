"use client";

// The selected competitor, visual-first: a compact identity bar, the metric
// gaps as paired bars (never a spreadsheet), the top three evidence-backed
// reasons they're ahead, and the single next move SOCIA recommends. Every
// number keeps its provenance; every absence keeps its reason.

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check, ExternalLink, Link2, Loader2, Plus, Sparkles } from "lucide-react";
import type { LeaderRow } from "@/lib/competitorRollup";
import { SOURCE_LABEL } from "@/lib/competitorRollup";
import type { Comparison as Cmp } from "@/lib/similarCompetitor";
import type { CompetitorRow, Learning, Reason } from "@/lib/competitorIntel";
import { Avatar, PlatformMark, cellText, classLabel, fmtN, platName } from "./shared";

const fmtC = (unit: Cmp["unit"], v: number) => (unit === "pct" ? `${v.toFixed(1)}%` : unit === "perWeek" ? `${v.toFixed(1)}/wk` : fmtN(v));

/* ---------- identity bar ---------- */

export function ProfileBar({ r, similarity, igEnabled, onTrack, tracking, notice }: {
  r: CompetitorRow; similarity: number | null; igEnabled: boolean; onTrack: (r: CompetitorRow) => void; tracking: boolean;
  /** Rendered directly under the bar: the outcome of the last Track attempt (a plan notice or an error line). */
  notice?: ReactNode;
}) {
  const gated = r.platform === "instagram" && !igEnabled;
  return (
    <>
    <div className="cx2-profilebar">
      <Avatar src={r.avatar} name={r.name} size={42} />
      <div className="cx2-profilebar-id">
        <b title={r.name}>{r.name}</b>
        <small><PlatformMark p={r.platform} size={10} /> @{r.handle}
          {r.classification && <em className={`cx-chip mini ${r.classification}`}>{classLabel(r.classification)}</em>}
        </small>
      </div>
      {similarity != null && (
        <span className="cx2-match" title="SOCIA relevance: niche, market, comparable audience and verified metrics">
          <b>{similarity}%</b> match
        </span>
      )}
      {gated && (
        <a href="/api/auth/facebook/start" className="cx2-gate-chip" title={`${platName(r.platform)} shares competitor numbers only through a linked Facebook Page.`}>
          <Link2 size={11} /> Unlock data
        </a>
      )}
      <div className="cx2-profilebar-actions">
        {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="ov-btn ghost small">Profile <ExternalLink size={11} /></a>}
        {r.tracked
          ? <span className="cx2-tracked"><Check size={12} /> Tracked</span>
          : <button type="button" className="ov-btn primary small" onClick={() => onTrack(r)} disabled={tracking}>{tracking ? <Loader2 size={12} className="cx-spin" /> : <Plus size={12} />} Track</button>}
      </div>
    </div>
    {notice}
    </>
  );
}

/* ---------- gap bars: where you're winning / losing ---------- */

const GAP_LABEL: Record<Cmp["key"], string> = { cadence: "Posting frequency", engagement: "Engagement", medianViews: "Median views", audience: "Audience" };
const GAP_ORDER: Cmp["key"][] = ["cadence", "engagement", "medianViews", "audience"];

function GapRow({ c, themName, connected, connectHref, delay }: { c: Cmp; themName: string; connected: boolean; connectHref: string; delay: number }) {
  const yv = c.you.state === "ok" ? c.you.value : null;
  const tv = c.them.state === "ok" ? c.them.value : null;
  const max = Math.max(yv ?? 0, tv ?? 0, 1e-9);
  const winning = c.diffPct != null && c.diffPct < 0; // them below you
  return (
    <li className="cx2-gap-row cx2-rise" style={{ animationDelay: `${delay}ms` }}>
      <div className="cx2-gap-head">
        <span className="cx2-gap-label">{GAP_LABEL[c.key]}</span>
        {c.diffPct == null
          ? <span className="cx2-delta none" title="One side isn't published, so no honest difference exists.">—</span>
          : <span className={`cx2-delta ${winning ? "up" : "down"}`}>{winning ? "you lead" : "they lead"} {c.diffPct > 0 ? "+" : ""}{Math.round(Math.abs(c.diffPct))}%</span>}
      </div>
      <div className="cx2-gap-pair">
        <div className="cx2-gap-bar">
          <span className="cx2-gap-who">YOU</span>
          <span className="cx2-gap-track">
            {yv != null
              ? <i className="you" style={{ ["--w" as string]: `${Math.max(3, (yv / max) * 100)}%` }} />
              : <i className="absent" />}
          </span>
          <b className={yv != null ? "" : "none"}>
            {yv != null ? fmtC(c.unit, yv)
              : !connected ? <a href={connectHref} className="ov-link">Connect</a>
              : cellText(c.you)}
          </b>
        </div>
        <div className="cx2-gap-bar">
          <span className="cx2-gap-who" title={themName}>THEM</span>
          <span className="cx2-gap-track">
            {tv != null
              ? <i className="them" style={{ ["--w" as string]: `${Math.max(3, (tv / max) * 100)}%` }} />
              : <i className="absent" />}
          </span>
          <b className={tv != null ? "" : "none"} title={c.them.source ? `${SOURCE_LABEL[c.them.source]}${c.them.sample ? ` · ${c.them.sample} posts` : ""}` : undefined}>
            {tv != null ? fmtC(c.unit, tv) : cellText(c.them)}
          </b>
        </div>
      </div>
    </li>
  );
}

export function GapBars({ comparisons, themName, connected, connectHref }: {
  comparisons: Cmp[]; themName: string; connected: boolean; connectHref: string;
}) {
  const ordered = GAP_ORDER.map((k) => comparisons.find((c) => c.key === k)).filter((c): c is Cmp => Boolean(c));
  const winning = ordered.filter((c) => c.diffPct != null && c.diffPct < 0).length;
  const comparable = ordered.filter((c) => c.diffPct != null).length;
  return (
    <section className="ov-card cx2-card cx2-gaps">
      <div className="cx2-card-head">
        <h2>Where you&apos;re winning</h2>
        {comparable > 0 && <span className={`cx2-tag ${winning >= comparable - winning ? "up" : "down"}`}>{winning} of {comparable} metrics</span>}
      </div>
      <ul className="cx2-gap-list">
        {ordered.map((c, i) => <GapRow key={c.key} c={c} themName={themName} connected={connected} connectHref={connectHref} delay={i * 70} />)}
      </ul>
      <small className="cx2-foot">You: authenticated Instagram data. {themName}: public platform data. A dash means one side isn&apos;t published — nothing is estimated.</small>
    </section>
  );
}

/* ---------- why they're winning ---------- */

export function WhyWinning({ reasons, r, connected, onEvidence }: {
  reasons: Reason[]; r: CompetitorRow | null; connected: boolean; onEvidence: (x: Reason) => void;
}) {
  return (
    <section className="ov-card cx2-card cx2-why">
      <div className="cx2-card-head"><h2>Why they&apos;re winning</h2>{reasons.length > 0 && <span className="cx2-micro">TOP {reasons.length} FACTOR{reasons.length === 1 ? "" : "S"}</span>}</div>
      {reasons.length ? (
        <div className="cx2-why-grid">
          {reasons.map((x, i) => {
            const yv = x.you.value, tv = x.them.value;
            const max = Math.max(yv ?? 0, tv ?? 0, 1e-9);
            return (
              <button type="button" key={x.key} className="cx2-why-card cx2-rise" style={{ animationDelay: `${i * 90}ms` }} onClick={() => onEvidence(x)} title="See the evidence behind this">
                <span className="cx2-why-n">{String(i + 1).padStart(2, "0")}</span>
                <b>{x.title}</b>
                <p>{x.detail}</p>
                <span className="cx2-mini-pair" aria-hidden>
                  <i className="you" style={{ ["--w" as string]: `${Math.max(4, ((yv ?? 0) / max) * 100)}%` }} />
                  <i className="them" style={{ ["--w" as string]: `${Math.max(4, ((tv ?? 0) / max) * 100)}%` }} />
                </span>
                <span className="cx2-why-more">Evidence <ArrowRight size={11} /></span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="cx-empty">
          {!r ? <p>Select a competitor to see the evidence.</p>
            : !connected ? <p>Connect your Instagram account to compare your numbers with {r.name}.</p>
            : r.postsGate === "connection_needed" ? <p>No metric is published for both accounts. Link a Facebook Page to read Instagram competitors.</p>
            : r.platform === "facebook" ? <p>Facebook publishes nothing about Pages you don&apos;t manage, so there is nothing to compare honestly.</p>
            : <p>{r.name} does not lead on any metric both accounts publish. Nothing here is guessed.</p>}
        </div>
      )}
    </section>
  );
}

/* ---------- your next move ---------- */

export function NextMove({ items, themName, onIdeas, onExamples }: {
  items: Learning[]; themName: string | null;
  onIdeas: (q: string) => void; onExamples: (tag: string | null, title: string) => void;
}) {
  if (!items.length) return null;
  const [lead, ...rest] = items;
  const actionEl = (l: Learning, primary: boolean) => {
    const cls = primary ? "ov-btn primary small" : "ov-btn outline small";
    if (l.action.kind === "plan") return <Link href={`/tool?note=${encodeURIComponent(l.action.note)}`} className={cls}>{l.action.label}</Link>;
    if (l.action.kind === "ideas") { const q = l.action.question; return <button type="button" className={cls} onClick={() => onIdeas(q)}>{l.action.label}</button>; }
    const tag = l.action.tag;
    return <button type="button" className={cls} onClick={() => onExamples(tag, l.title)}>{l.action.label}</button>;
  };
  return (
    <section className="ov-card cx2-card cx2-move">
      <div className="cx2-card-head">
        <h2><Sparkles size={14} /> Your next move</h2>
        {themName && <span className="cx2-micro">FROM {themName.toUpperCase().slice(0, 24)}&apos;S REAL NUMBERS</span>}
      </div>
      <div className="cx2-move-lead cx2-rise">
        <div className="cx2-move-body">
          <b>{lead.title}</b>
          <p>{lead.observed}</p>
        </div>
        {actionEl(lead, true)}
      </div>
      {rest.length > 0 && (
        <div className="cx2-move-rest">
          {rest.map((l) => (
            <div key={l.n} className="cx2-move-item cx2-rise" style={{ animationDelay: `${l.n * 80}ms` }}>
              <span className="cx2-move-n">{String(l.n).padStart(2, "0")}</span>
              <div className="cx2-move-body"><b>{l.title}</b><p>{l.observed}</p></div>
              {actionEl(l, false)}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
