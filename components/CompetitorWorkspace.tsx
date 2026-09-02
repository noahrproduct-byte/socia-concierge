"use client";

// Competitors workspace: table → selected/most-similar competitor → why →
// their content → discovered for you.
//
// Selecting a table row drives the three panels without a reload. The default
// selection is the computed most-similar outperformer (lib/similarCompetitor),
// never the biggest account. Every sentence in "what they're doing well" is
// derived from a pair of real values and carries both numbers.

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X, ExternalLink, ArrowRight, Plus, Check, Loader2, Info, Sparkles } from "lucide-react";
import CompetitorLeaderboard from "@/components/CompetitorLeaderboard";
import WinningContentCarousel from "@/components/WinningContentCarousel";
import { CELL_REASON, SOURCE_LABEL, type Cell, type LeaderRow } from "@/lib/competitorRollup";
import { pickMostSimilar, compareRows, leadsOn, similarity, doingWell, type Comparison, type SimilarPick } from "@/lib/similarCompetitor";
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

/** Does this content belong to this account? Names from web research and
 *  channel titles from the API share no id, so match on the text both carry. */
const belongsTo = (item: WinningItem, r: LeaderRow) => {
  const a = (item.accountName ?? "").toLowerCase();
  if (!a) return false;
  const n = r.name.toLowerCase();
  return a.includes(r.handle.toLowerCase()) || a.includes(n) || n.includes(a);
};

export default function CompetitorWorkspace({ rows, content, days }: { rows: LeaderRow[]; content: WinningItem[]; days: number }) {
  const router = useRouter();
  const [open, setOpen] = useState<LeaderRow | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [justTracked, setJustTracked] = useState<Set<string>>(new Set());

  const you = useMemo(() => rows.find((r) => r.isYou), [rows]);
  const autoPick = useMemo(() => pickMostSimilar(rows), [rows]);

  // The active competitor: the user's selection, else the computed pick.
  const active: SimilarPick | null = useMemo(() => {
    if (!you) return null;
    const sel = selectedId ? rows.find((r) => r.id === selectedId && !r.isYou) : null;
    if (sel) return { row: sel, similarity: similarity(you, sel), leads: leadsOn(you, sel), comparisons: compareRows(you, sel) };
    return autoPick;
  }, [rows, you, selectedId, autoPick]);
  const isAuto = !selectedId || active?.row.id === autoPick?.row.id;

  const themes = useMemo(() => {
    if (!active) return [];
    const counts = new Map<string, number>();
    for (const it of content) if (belongsTo(it, active.row)) for (const t of it.trendTags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
  }, [active, content]);
  const observations = useMemo(() => (active ? doingWell(active, themes) : []), [active, themes]);

  // Winning content: the active competitor's posts first, then posts by other
  // table accounts, then the most relevant of the rest. Relevance, not raw
  // views, decides — a 20M-view clip from an unrelated creator ranks below a
  // 100K-view post from the pizzeria across town.
  const winning = useMemo(() => {
    const comps = rows.filter((r) => !r.isYou);
    const rank = (a: WinningItem, b: WinningItem) => b.relevanceScore - a.relevanceScore || (b.multiplier ?? 0) - (a.multiplier ?? 0);
    const mine = active ? content.filter((c) => belongsTo(c, active.row)) : [];
    const others = content.filter((c) => !mine.includes(c) && comps.some((r) => belongsTo(c, r)));
    const rest = content.filter((c) => !mine.includes(c) && !others.includes(c) && c.relevanceScore >= 40);
    return [...mine.sort(rank), ...others.sort(rank), ...rest.sort(rank)].slice(0, 10);
  }, [rows, content, active]);

  const untracked = useMemo(
    () => rows.filter((r) => !r.isYou && !r.tracked).sort((a, b) => (b.match ?? -1) - (a.match ?? -1)),
    [rows],
  );
  const discovered = untracked.slice(6, 10);
  const beyond = Math.max(0, untracked.length - 6);

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

  const analyzeQ = active
    ? `Compare my account with ${active.row.name} (@${active.row.handle}) using only these measured numbers: ${active.comparisons
        .filter((c) => c.diffPct != null)
        .map((c) => `${c.label}: me ${fmtC(c, c.you)}, them ${fmtC(c, c.them)}`)
        .join("; ")}. Explain what they do differently and give me three concrete things to test this month.`
    : "";

  const measurable = active ? active.comparisons.filter((c) => c.diffPct != null).length : 0;

  return (
    <>
      {/* ---------- 1. table ---------- */}
      <section className="cw-block">
        <CompetitorLeaderboard
          rows={rows}
          selectedId={active?.row.id ?? null}
          onSelect={(r) => setSelectedId(r.id)}
          onOpen={setOpen}
          onTrack={track}
          expanded={expanded}
          onExpandedChange={setExpanded}
        />
      </section>

      {/* ---------- 2 · 3 · 4 ---------- */}
      <div className="cw-trio">
        {/* most similar / selected */}
        <section className="cw-panel">
          <div className="cw-panel-head">
            <h2>
              {isAuto ? "Most similar competitor" : "Selected competitor"}
              <Info size={13} className="cw-info" aria-label="How this is chosen" />
            </h2>
            {!isAuto && (
              <button type="button" className="cw-reset" onClick={() => setSelectedId(null)}>Show most similar</button>
            )}
          </div>
          {active && you ? (
            <>
              <div className="cw-pick">
                {active.row.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={active.row.avatar} alt="" width={44} height={44} />
                ) : <span className="cp4-face ph">{active.row.name[0]?.toUpperCase()}</span>}
                <span className="cw-pick-id">
                  <b title={active.row.name}>{active.row.name}</b>
                  <small>@{active.row.handle} · {platName(active.row.platform)}</small>
                </span>
                <span
                  className="cw-match"
                  title={active.row.match != null
                    ? "SOCIA relevance score: niche, locality, comparable audience and verified metrics"
                    : "Similarity from classification and audience proximity"}
                >
                  {active.similarity}% match
                </span>
              </div>
              <div className="cw-tags">
                {active.row.classification && <span>{CLASSIFICATION_LABEL[active.row.classification as Classification] ?? active.row.classification}</span>}
                <span>{platName(active.row.platform)}</span>
                {measurable > 0 && <span>Leads on {active.leads} of {measurable} metrics</span>}
              </div>
              <div className="cw-cmp-head"><b>Key comparison</b><small>Last {days} days</small></div>
              <table className="cw-cmp-table">
                <thead><tr><th>Metric</th><th>You</th><th>Competitor</th><th>Difference</th></tr></thead>
                <tbody>
                  {active.comparisons.map((c) => (
                    <tr key={c.key}>
                      <td>{c.label}</td>
                      <td>{fmtC(c, c.you)}</td>
                      <td title={c.them.source ? SOURCE_LABEL[c.them.source] : undefined}>{fmtC(c, c.them)}</td>
                      <td>
                        {c.diffPct == null ? (
                          <span className="lb-absent" title="One side isn't published, so no honest difference exists.">—</span>
                        ) : (
                          <span className={`cw-diff ${c.diffPct > 0 ? "up" : "down"}`}>
                            {c.diffPct > 0 ? "↑" : "↓"} {Math.abs(Math.round(c.diffPct)).toLocaleString("en-US")}%
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td>30d growth</td>
                    <td>{cellText(you.momentum, (n) => `${n >= 0 ? "+" : ""}${fmtN(n)}`)}</td>
                    <td><span className="lb-absent">—</span></td>
                    <td><span className="lb-absent">—</span></td>
                  </tr>
                </tbody>
              </table>
              <div className="cw-actions">
                <button type="button" className="cw-btn ghost" onClick={() => setOpen(active.row)}>View full comparison</button>
                <a className="cw-btn" href={`/chat?q=${encodeURIComponent(analyzeQ)}`}>Analyze this competitor <ArrowRight size={13} /></a>
              </div>
            </>
          ) : (
            <p className="cp4-empty">
              No similar account is measurably outperforming you yet. This fills in as SOCIA discovers competitors
              with public metrics, or once Meta is connected for Instagram competitor data.
            </p>
          )}
        </section>

        {/* why */}
        <section className="cw-panel">
          <div className="cw-panel-head"><h2>What they&apos;re doing well</h2></div>
          {observations.length ? (
            <ul className="cw-obs">
              {observations.map((o) => (
                <li key={o.key}>
                  <b>{o.title}</b>
                  <p>{o.detail}</p>
                </li>
              ))}
            </ul>
          ) : active ? (
            <p className="cp4-empty">
              Nothing measurable yet — no metric is published for both accounts.
              {active.row.platform !== "youtube" && " Connect Meta to unlock Instagram competitor data."}
            </p>
          ) : (
            <p className="cp4-empty">Observations appear once a competitor with public metrics is selected.</p>
          )}
          {active && <a className="cw-link" href={`/chat?q=${encodeURIComponent(analyzeQ)}`}>See all insights <ArrowRight size={13} /></a>}
        </section>

        {/* winning content */}
        <section className="cw-panel cw-content">
          <div className="cw-panel-head">
            <h2>Winning content <small>Last 30 days</small></h2>
            <a className="cw-link inline" href="/niche">View all content <ArrowRight size={13} /></a>
          </div>
          {winning.length ? (
            <WinningContentCarousel items={winning} />
          ) : (
            <div className="cw-empty">
              <b>We don&apos;t have enough verified competitor post data yet.</b>
              <p>Refresh discovery to search your niche, or track a competitor with public posts.</p>
            </div>
          )}
        </section>
      </div>

      {/* ---------- 5. discovered ---------- */}
      <section className="cw-block cw-disc">
        <div className="cw-panel-head">
          <h2><Sparkles size={14} className="cw-spark" /> Discovered for you <small>High-match accounts SOCIA found in your niche.</small></h2>
          {beyond > 4 && (
            <button type="button" className="cw-link inline" onClick={() => { setExpanded(true); document.querySelector(".lb")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
              Explore {beyond - 4} more accounts <ArrowRight size={13} />
            </button>
          )}
        </div>
        {discovered.length ? (
          <ul className="cw-disc-list">
            {discovered.map((r) => (
              <li key={r.id}>
                {r.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.avatar} alt="" width={34} height={34} />
                ) : <span className="cp4-face ph sm">{r.name[0]?.toUpperCase()}</span>}
                <span className="cw-disc-id">
                  <b title={r.name}>{r.name}</b>
                  <small>@{r.handle} · {platName(r.platform)}</small>
                </span>
                <span className="cw-disc-num">
                  <b>{r.audience.state === "ok" ? fmtN(r.audience.value) : "—"}</b>
                  <small>{r.audience.state === "ok" ? (r.platform === "youtube" ? "subscribers" : "followers") : "not published"}</small>
                  {r.match != null && <em>{r.match}% match</em>}
                </span>
                {justTracked.has(r.id) ? (
                  <span className="lb-tracked"><Check size={12} /> Tracked</span>
                ) : (
                  <button type="button" onClick={() => track(r)} disabled={busy === r.id}>
                    {busy === r.id ? <Loader2 size={11} className="cp4-spin" /> : <Plus size={11} />} Track
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="cp4-empty">Everything SOCIA has found is already in the table above.</p>
        )}
      </section>

      {open && you && <DetailDrawer r={open} you={you} onClose={() => setOpen(null)} />}
    </>
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
