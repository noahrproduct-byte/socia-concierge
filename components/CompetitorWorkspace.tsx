"use client";

// Competitors workspace.
//
//   roster (horizontal) → select one → comparison · why · winning content →
//   patterns · what to learn · discover more
//
// Everything below the roster reacts to the selected card without a reload.
// The default selection is the computed most-similar outperformer, never the
// biggest account. Every comparison, observation, pattern share and multiplier
// is computed from values the page already holds; the AI is only ever asked to
// interpret numbers that are on screen.

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X, ExternalLink, ArrowRight, Plus, Check, Loader2, Info, ChevronLeft, ChevronRight } from "lucide-react";
import CompetitorRoster from "@/components/CompetitorRoster";
import WinningContentCarousel from "@/components/WinningContentCarousel";
import WinningContentAnalysisDrawer from "@/components/WinningContentAnalysisDrawer";
import { CELL_REASON, SOURCE_LABEL, type Cell, type LeaderRow } from "@/lib/competitorRollup";
import { pickMostSimilar, compareRows, leadsOn, similarity, doingWell, type Comparison, type SimilarPick } from "@/lib/similarCompetitor";
import { patternsFor, recommendationsFor } from "@/lib/competitorPatterns";
import { CLASSIFICATION_LABEL, type Classification } from "@/lib/discovery";

export type WinningItem = {
  url: string;
  platform: string;
  accountName: string | null;
  title: string | null;
  thumbnailUrl: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  publishedAt: string | null;
  multiplier: number | null;
  relevanceScore: number;
  trendTags: string[];
  /** Web-research interpretation, when one exists. Labelled as such in the UI. */
  why: string | null;
};

const fmtN = (n: number | null | undefined): string =>
  n == null ? "—"
  : n >= 1e9 ? (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B"
  : n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M"
  : n >= 1e4 ? Math.round(n / 1e3) + "K"
  : Math.round(n).toLocaleString("en-US");

const cellText = (c: Cell, fmt?: (n: number) => string): string =>
  c.state === "ok" && c.value != null
    ? fmt ? fmt(c.value) : fmtN(c.value)
    : c.state === "unknown" ? "—" : CELL_REASON[c.state as Exclude<Cell["state"], "ok">];

const fmtC = (c: Comparison, cl: Cell) =>
  cellText(cl, (n) => (c.unit === "pct" ? `${n.toFixed(1)}%` : c.unit === "perWeek" ? n.toFixed(1) : fmtN(n)));

const platName = (p: string) => (p === "youtube" ? "YouTube" : p === "facebook" ? "Facebook" : "Instagram");

/** Does this post belong to this account? Names from web research and
 *  channel titles from the API share no id, so match on the text both carry. */
const belongsTo = (item: WinningItem, r: LeaderRow) => {
  const a = (item.accountName ?? "").toLowerCase();
  if (!a) return false;
  const n = r.name.toLowerCase();
  return a.includes(r.handle.toLowerCase()) || a.includes(n) || n.includes(a);
};

const ROSTER_MAX = 12;

export default function CompetitorWorkspace({
  rows, content, days, location,
}: { rows: LeaderRow[]; content: WinningItem[]; days: number; location: string | null }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState<LeaderRow | null>(null);
  const [analyze, setAnalyze] = useState<WinningItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [justTracked, setJustTracked] = useState<Set<string>>(new Set());
  const [allDiscovered, setAllDiscovered] = useState(false);

  const you = useMemo(() => rows.find((r) => r.isYou), [rows]);

  // Roster = accounts SOCIA actively compares: everything tracked, then the
  // best-matched discoveries. Discovery strip = the rest, not yet tracked.
  const { roster, discovered } = useMemo(() => {
    const comps = rows.filter((r) => !r.isYou);
    const tracked = comps.filter((r) => r.tracked);
    const untracked = comps.filter((r) => !r.tracked).sort((a, b) => (b.match ?? -1) - (a.match ?? -1));
    const fill = Math.max(0, ROSTER_MAX - tracked.length);
    const roster = [...tracked, ...untracked.slice(0, fill)].sort((a, b) => (b.match ?? -1) - (a.match ?? -1));
    return { roster, discovered: untracked.slice(fill) };
  }, [rows]);

  const autoPick = useMemo(() => (you ? pickMostSimilar([you, ...roster]) : null), [you, roster]);

  const active: SimilarPick | null = useMemo(() => {
    if (!you) return null;
    const sel = selectedId ? roster.find((r) => r.id === selectedId) : null;
    if (sel) return { row: sel, similarity: similarity(you, sel), leads: leadsOn(you, sel), comparisons: compareRows(you, sel) };
    return autoPick;
  }, [you, roster, selectedId, autoPick]);

  const theirPosts = useMemo(() => (active ? content.filter((c) => belongsTo(c, active.row)) : []), [active, content]);
  const patterns = useMemo(
    () => patternsFor(theirPosts.map((p) => ({ title: p.title, multiplier: p.multiplier, url: p.url })), location),
    [theirPosts, location],
  );
  const observations = useMemo(() => {
    if (!active) return [];
    const themes = patterns.insufficient ? [] : patterns.patterns.map((p) => ({ tag: p.tag, count: p.count }));
    return doingWell(active, themes);
  }, [active, patterns]);
  const recs = useMemo(() => (active ? recommendationsFor(active, observations, patterns) : []), [active, observations, patterns]);

  // Winning content: the selected competitor's posts, then other roster
  // accounts', then the most relevant of the rest. Relevance, never raw views.
  const winning = useMemo(() => {
    // Evidence first: a post with a computed baseline multiple, then one with
    // public counts, then one with at least a thumbnail. A web-found link with
    // nothing verifiable is real and stays, but it must not lead the carousel
    // ahead of posts whose performance SOCIA can actually show.
    const evidence = (c: WinningItem) =>
      (c.multiplier != null ? 4 : 0) + (c.views != null ? 2 : 0) + (c.thumbnailUrl ? 1 : 0);
    const rank = (a: WinningItem, b: WinningItem) =>
      evidence(b) - evidence(a) || b.relevanceScore - a.relevanceScore || (b.multiplier ?? 0) - (a.multiplier ?? 0);
    const mine = theirPosts;
    const others = content.filter((c) => !mine.includes(c) && roster.some((r) => belongsTo(c, r)));
    const rest = content.filter((c) => !mine.includes(c) && !others.includes(c) && c.relevanceScore >= 40);
    const tiered = [...mine.sort(rank), ...others.sort(rank), ...rest.sort(rank)];
    // Tier order holds among posts with evidence; unverifiable ones close the row.
    return [...tiered.filter((c) => evidence(c) > 0), ...tiered.filter((c) => evidence(c) === 0)].slice(0, 12);
  }, [theirPosts, content, roster]);

  const track = useCallback(async (r: LeaderRow) => {
    setBusy(r.id);
    try {
      await fetch("/api/competitors", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: r.handle, platform: r.platform }),
      });
      setJustTracked((s) => new Set(s).add(r.id));
      router.refresh();
    } finally { setBusy(null); }
  }, [router]);

  const measurable = active ? active.comparisons.filter((c) => c.diffPct != null).length : 0;
  const shownDiscovered = allDiscovered ? discovered : discovered.slice(0, 5);

  return (
    <>
      {/* ───────── 1. roster ───────── */}
      <section className="cw-block">
        <div className="cw-block-head">
          <h2>Competitors in your niche</h2>
          <small>Accounts SOCIA believes are most relevant to your business, audience, location, and goals.</small>
        </div>
        {roster.length ? (
          <CompetitorRoster you={you} rows={roster} selectedId={active?.row.id ?? null} onSelect={(r) => setSelectedId(r.id)} />
        ) : (
          <p className="cp4-empty">No competitors yet — run Refresh to let SOCIA search your niche, or add one with Manage competitors.</p>
        )}
      </section>

      {/* ───────── 2 · 3 · 4 ───────── */}
      <div className="cw-trio">
        <section className="cw-panel">
          {active && you ? (
            <>
              <div className="cw-pick">
                {active.row.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={active.row.avatar} alt="" width={52} height={52} />
                ) : <span className="cp4-face ph big">{active.row.name[0]?.toUpperCase()}</span>}
                <span className="cw-pick-id">
                  <b title={active.row.name}>{active.row.name}</b>
                  <small>@{active.row.handle} · {platName(active.row.platform)}</small>
                </span>
              </div>
              <div className="cw-pick-row">
                {active.row.classification && (
                  <span className={`cr-chip ${active.row.classification}`}>{CLASSIFICATION_LABEL[active.row.classification as Classification] ?? active.row.classification}</span>
                )}
                <b className="cw-match-big" title={active.row.match != null ? "SOCIA relevance score: niche, locality, comparable audience and verified metrics" : "Similarity from classification and audience proximity"}>
                  {active.similarity}% <span>match</span>
                </b>
              </div>
              <div className="cw-tags">
                <span>{platName(active.row.platform)}</span>
                {active.row.topFormat && <span>Top format: {active.row.topFormat}</span>}
                {measurable > 0 && <span>Leads on {active.leads} of {measurable} metrics</span>}
                {active.row.id !== autoPick?.row.id && (
                  <button type="button" className="cw-reset" onClick={() => setSelectedId(null)}>Back to most similar</button>
                )}
              </div>

              <div className="cw-cmp-head"><b>Performance comparison</b><small>Last {days} days</small></div>
              <table className="cw-cmp-table">
                <thead><tr><th>Metric</th><th>You</th><th title={active.row.name}>{active.row.name}</th><th>Difference</th></tr></thead>
                <tbody>
                  {active.comparisons.map((c) => (
                    <tr key={c.key}>
                      <td>{c.label}</td>
                      <td>{fmtC(c, c.you)}</td>
                      <td title={c.them.source ? SOURCE_LABEL[c.them.source] : undefined}>{fmtC(c, c.them)}</td>
                      <td>
                        {c.diffPct == null
                          ? <span className="lb-absent" title="One side isn't published, so no honest difference exists.">—</span>
                          : <span className={`cw-diff ${c.diffPct > 0 ? "up" : "down"}`}>{c.diffPct > 0 ? "↑" : "↓"} {Math.abs(Math.round(c.diffPct)).toLocaleString("en-US")}%</span>}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td>30d growth</td>
                    <td>{cellText(you.momentum, (n) => `${n >= 0 ? "+" : ""}${fmtN(n)}`)}</td>
                    <td><span className="lb-absent" title="No platform publishes follower history for accounts you don't own.">—</span></td>
                    <td><span className="lb-absent">—</span></td>
                  </tr>
                </tbody>
              </table>
              <div className="cw-actions">
                <button type="button" className="cw-btn ghost" onClick={() => setOpen(active.row)}>Full comparison</button>
                {active.row.url && <a className="cw-btn ghost" href={active.row.url} target="_blank" rel="noreferrer">Open profile <ExternalLink size={12} /></a>}
              </div>
            </>
          ) : (
            <p className="cp4-empty">
              No similar account is measurably outperforming you yet. This fills in as SOCIA discovers competitors with
              public metrics, or once Meta is connected for Instagram competitor data.
            </p>
          )}
        </section>

        <section className="cw-panel">
          <div className="cw-panel-head"><h2>Why they&apos;re outperforming you <Info size={13} className="cw-info" /></h2></div>
          {observations.length ? (
            <ul className="cw-obs">
              {observations.slice(0, 4).map((o) => (
                <li key={o.key}><b>{o.title}</b><p>{o.detail}</p></li>
              ))}
            </ul>
          ) : active ? (
            <p className="cp4-empty">
              Nothing measurable yet — no metric is published for both accounts.
              {active.row.platform !== "youtube" && " Connect Meta to unlock Instagram competitor data."}
            </p>
          ) : (
            <p className="cp4-empty">Select a competitor to see the evidence.</p>
          )}
          {active && (
            <a className="cw-link" href={`/chat?q=${encodeURIComponent(`Compare my account with ${active.row.name} using only these measured numbers: ${active.comparisons.filter((c) => c.diffPct != null).map((c) => `${c.label}: me ${fmtC(c, c.you)}, them ${fmtC(c, c.them)}`).join("; ")}. What do they do differently?`)}`}>
              See all insights <ArrowRight size={13} />
            </a>
          )}
        </section>

        <section className="cw-panel cw-content">
          <div className="cw-panel-head">
            <h2>Winning content <small>Last 30 days</small></h2>
            <a className="cw-link inline" href="#trends">View all content <ArrowRight size={13} /></a>
          </div>
          {winning.length ? (
            <WinningContentCarousel items={winning} onAnalyze={setAnalyze} />
          ) : (
            <div className="cw-empty">
              <b>We don&apos;t have enough verified competitor post data yet.</b>
              <p>Refresh to search your niche, or track a competitor with public posts.</p>
            </div>
          )}
        </section>
      </div>

      {/* ───────── 5 · 6 · 7 ───────── */}
      <div className="cb-row">
        <section className="cw-panel">
          <div className="cw-panel-head"><h2>Patterns SOCIA noticed <Info size={13} className="cw-info" /></h2></div>
          {!active ? (
            <p className="cp4-empty">Select a competitor to analyse their posts.</p>
          ) : patterns.insufficient ? (
            <p className="cp4-empty">
              Not enough content yet to identify reliable patterns — {patterns.total} of {patterns.minSample} posts needed for {active.row.name}.
            </p>
          ) : patterns.patterns.length ? (
            <>
              <ol className="cb-patterns">
                {patterns.patterns.slice(0, 5).map((p, i) => (
                  <li key={p.tag}>
                    <span className="cb-num">{String(i + 1).padStart(2, "0")}</span>
                    <span className="cb-pat">
                      <b>{p.tag}</b>
                      <span className="cb-bar" aria-hidden><i style={{ width: `${p.share}%` }} /></span>
                      <small>
                        {p.count} / {p.total} analysed posts
                        {p.medianMultiplier != null && ` · median ${p.medianMultiplier.toFixed(1)}× baseline`}
                      </small>
                    </span>
                    <span className={`cb-impact ${p.impact}`}>{p.impact === "high" ? "High impact" : "Medium impact"}</span>
                  </li>
                ))}
              </ol>
              <small className="cb-based">Based on {patterns.total} analysed posts</small>
            </>
          ) : (
            <p className="cp4-empty">No repeated pattern across their {patterns.total} analysed posts.</p>
          )}
        </section>

        <section className="cw-panel">
          <div className="cw-panel-head"><h2 title={active ? `What you can learn from ${active.row.name}` : undefined}>What you can learn{active ? ` from ${active.row.name}` : ""} <Info size={13} className="cw-info" /></h2></div>
          {recs.length ? (
            <ol className="cb-recs">
              {recs.map((r) => (
                <li key={r.n}>
                  <span className="cb-recnum">{r.n}</span>
                  <span className="cb-rec">
                    <b>{r.title}</b>
                    <small>{r.evidence}</small>
                    <small><em>Recommended test:</em> {r.test}</small>
                  </span>
                  <a className="cw-btn ghost sm" href={r.cta.href}>{r.cta.label}</a>
                </li>
              ))}
            </ol>
          ) : (
            <p className="cp4-empty">Recommendations appear once a comparison shows a measurable gap.</p>
          )}
        </section>

        <section className="cw-panel cb-discover">
          <div className="cw-panel-head">
            <h2>Discover more competitors <Info size={13} className="cw-info" /></h2>
            {discovered.length > 5 && (
              <button type="button" className="cw-link inline" onClick={() => setAllDiscovered((v) => !v)}>
                {allDiscovered ? "Show fewer" : `Explore all ${discovered.length} discovered`} <ArrowRight size={13} />
              </button>
            )}
          </div>
          {shownDiscovered.length ? (
            <DiscoverStrip rows={shownDiscovered} busy={busy} tracked={justTracked} onTrack={track} />
          ) : (
            <p className="cp4-empty">Everything SOCIA has found is already in the roster above.</p>
          )}
        </section>
      </div>

      {open && you && <DetailDrawer r={open} you={you} onClose={() => setOpen(null)} />}
      {analyze && <WinningContentAnalysisDrawer item={analyze} onClose={() => setAnalyze(null)} />}
    </>
  );
}

function DiscoverStrip({ rows, busy, tracked, onTrack }: { rows: LeaderRow[]; busy: string | null; tracked: Set<string>; onTrack: (r: LeaderRow) => void }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const step = (d: 1 | -1) => el?.scrollBy({ left: 260 * d, behavior: "smooth" });
  const overflow = el ? el.scrollWidth > el.clientWidth + 4 : false;
  return (
    <div className="cd-wrap">
      {overflow && <button type="button" className="cr-arrow left sm" onClick={() => step(-1)} aria-label="Previous discovered competitors"><ChevronLeft size={14} /></button>}
      <div className="cd-scroll" ref={setEl} role="list">
        {rows.map((r) => (
          <div className="cd-item" role="listitem" key={r.id}>
            {r.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.avatar} alt="" width={36} height={36} />
            ) : <span className="cr-ph sm">{r.name[0]?.toUpperCase()}</span>}
            <span className="cd-id">
              <b title={r.name}>{r.name}</b>
              <small>@{r.handle} <i className={`lb-dot ${r.platform}`} /></small>
              <small>
                {r.audience.state === "ok" ? `${fmtN(r.audience.value)} ${r.platform === "youtube" ? "subscribers" : "followers"}` : "followers not published"}
                {r.match != null && <em> · {r.match}% match</em>}
              </small>
            </span>
            {tracked.has(r.id) ? (
              <span className="lb-tracked"><Check size={12} /> Tracked</span>
            ) : (
              <button type="button" onClick={() => onTrack(r)} disabled={busy === r.id}>
                {busy === r.id ? <Loader2 size={11} className="cp4-spin" /> : <Plus size={11} />} Track
              </button>
            )}
          </div>
        ))}
      </div>
      {overflow && <button type="button" className="cr-arrow right sm" onClick={() => step(1)} aria-label="Next discovered competitors"><ChevronRight size={14} /></button>}
    </div>
  );
}

function DetailDrawer({ r, you, onClose }: { r: LeaderRow; you: LeaderRow; onClose: () => void }) {
  const cmp = compareRows(you, r);
  const measurable = cmp.filter((c) => c.diffPct != null);
  const theyWin = measurable.filter((c) => c.diffPct! > 0);
  const youWin = measurable.filter((c) => c.diffPct! <= 0);
  return (
    <div className="cp4-modal-wrap" role="dialog" aria-modal="true" aria-label={`${r.name} details`}>
      <div className="cp4-scrim" onClick={onClose} />
      <aside className="cp4-drawer">
        <div className="cp4-modal-head">
          {r.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="cp4-face big" src={r.avatar} alt="" width={46} height={46} />
          ) : <span className="cp4-face ph big">{r.name[0]?.toUpperCase()}</span>}
          <div className="cp4-drawer-id">
            <h3>{r.name}</h3>
            <small>@{r.handle} · {platName(r.platform)}{r.match != null && ` · ${r.match}% match`}</small>
          </div>
          <button type="button" className="cp4-x" onClick={onClose} aria-label="Close"><X size={15} /></button>
        </div>
        {r.url && <a className="cp4-drawer-visit" href={r.url} target="_blank" rel="noreferrer">Open profile <ExternalLink size={13} /></a>}
        <div className="cp4-drawer-sec">
          <h4>Comparison</h4>
          <table className="cw-cmp-table">
            <thead><tr><th>Metric</th><th>You</th><th>Them</th><th>Diff</th></tr></thead>
            <tbody>
              {cmp.map((c) => (
                <tr key={c.key}>
                  <td>{c.label}</td>
                  <td>{fmtC(c, c.you)}</td>
                  <td title={c.them.source ? SOURCE_LABEL[c.them.source] : undefined}>{fmtC(c, c.them)}</td>
                  <td>{c.diffPct == null ? <span className="lb-absent">—</span> : <span className={`cw-diff ${c.diffPct > 0 ? "up" : "down"}`}>{c.diffPct > 0 ? "↑" : "↓"} {Math.abs(Math.round(c.diffPct))}%</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {measurable.length ? (
          <>
            <div className="cp4-drawer-sec">
              <h4>What they do better</h4>
              {theyWin.length ? <ul className="cw-cmp">{theyWin.map((c) => <li key={c.key}><span>{c.label}</span><em>{fmtC(c, c.them)} vs your {fmtC(c, c.you)}</em></li>)}</ul>
                : <p className="cp4-drawer-note">Nothing measurable — you lead on every comparable metric.</p>}
            </div>
            <div className="cp4-drawer-sec">
              <h4>What you do better</h4>
              {youWin.length ? <ul className="cw-cmp">{youWin.map((c) => <li key={c.key}><span>{c.label}</span><em>{fmtC(c, c.you)} vs their {fmtC(c, c.them)}</em></li>)}</ul>
                : <p className="cp4-drawer-note">Nothing leads yet on the metrics both accounts publish.</p>}
            </div>
          </>
        ) : (
          <div className="cp4-drawer-sec">
            <p className="cp4-drawer-note"><Info size={11} /> No metric is published for both accounts, so there is nothing to compare honestly.</p>
          </div>
        )}
      </aside>
    </div>
  );
}
