"use client";

// Competitors workspace: table → most similar outperformer → why → their
// content → discovered for you.
//
// Every number arrives from the server with its provenance. The "most
// similar" pick and every "why they're winning" sentence are computed from
// pairs of real values (lib/similarCompetitor); nothing is generated.

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X, ExternalLink, ArrowRight, Plus, Check, Loader2, Info, Play, Heart, MessageCircle } from "lucide-react";
import CompetitorLeaderboard from "@/components/CompetitorLeaderboard";
import { CELL_REASON, SOURCE_LABEL, type Cell, type LeaderRow } from "@/lib/competitorRollup";
import { pickMostSimilar, doingWell, type Comparison } from "@/lib/similarCompetitor";
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
  : n.toLocaleString("en-US");

const cellText = (c: Cell, fmt?: (n: number) => string): string =>
  c.state === "ok" && c.value != null
    ? fmt ? fmt(c.value) : fmtN(c.value)
    : c.state === "unknown" ? "—" : CELL_REASON[c.state as Exclude<Cell["state"], "ok">];

const fmtC = (c: Comparison, cl: Cell) =>
  cellText(cl, (n) => (c.unit === "pct" ? `${n.toFixed(1)}%` : c.unit === "perWeek" ? n.toFixed(1) : fmtN(n)));

/** Does this content belong to this leaderboard account? Names from web
 *  research and channel titles from the API don't share an id, so match on
 *  the text both sides actually carry. */
const belongsTo = (item: WinningItem, r: LeaderRow) => {
  const a = (item.accountName ?? "").toLowerCase();
  if (!a) return false;
  return a.includes(r.handle.toLowerCase()) || a.includes(r.name.toLowerCase()) || r.name.toLowerCase().includes(a);
};

export default function CompetitorWorkspace({ rows, content }: { rows: LeaderRow[]; content: WinningItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<LeaderRow | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [justTracked, setJustTracked] = useState<Set<string>>(new Set());

  const you = useMemo(() => rows.find((r) => r.isYou), [rows]);
  const pick = useMemo(() => pickMostSimilar(rows), [rows]);

  // Themes only from posts SOCIA actually found for the picked account.
  const pickThemes = useMemo(() => {
    if (!pick) return [];
    const counts = new Map<string, number>();
    for (const it of content) if (belongsTo(it, pick.row)) for (const t of it.trendTags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
  }, [pick, content]);
  const observations = useMemo(() => (pick ? doingWell(pick, pickThemes) : []), [pick, pickThemes]);

  // Winning content: posts by accounts in the table first, then the most
  // relevant of the rest. Never generic virality — relevance decides.
  const winning = useMemo(() => {
    const competitors = rows.filter((r) => !r.isYou);
    const own = content.filter((c) => competitors.some((r) => belongsTo(c, r)));
    const rest = content.filter((c) => !own.includes(c) && c.relevanceScore >= 40);
    const rank = (a: WinningItem, b: WinningItem) => b.relevanceScore - a.relevanceScore || (b.multiplier ?? 0) - (a.multiplier ?? 0);
    return [...own.sort(rank), ...rest.sort(rank)].slice(0, 3);
  }, [rows, content]);

  // Discovered for you: untracked accounts beyond the six the table shows.
  const discovered = useMemo(
    () => rows.filter((r) => !r.isYou && !r.tracked).sort((a, b) => (b.match ?? -1) - (a.match ?? -1)).slice(6, 10),
    [rows],
  );
  const beyond = Math.max(0, rows.filter((r) => !r.isYou && !r.tracked).length - 6);

  const track = useCallback(async (r: LeaderRow) => {
    setBusy(r.id);
    try {
      await fetch("/api/competitors", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: r.handle, platform: r.platform }),
      });
      setJustTracked((s) => new Set(s).add(r.id));
      router.refresh();
    } finally {
      setBusy(null);
    }
  }, [router]);

  const analyzeQ = pick
    ? `Compare my account with ${pick.row.name} (@${pick.row.handle}) using only these measured numbers: ${pick.comparisons
        .filter((c) => c.diffPct != null)
        .map((c) => `${c.label}: me ${fmtC(c, c.you)}, them ${fmtC(c, c.them)}`)
        .join("; ")}. Explain what they do differently and give me three concrete things to test this month.`
    : "";

  return (
    <>
      {/* ---------- 1. the table ---------- */}
      <section className="cw-block">
        <div className="cp4-sec-head">
          <h2>Competitors in your niche</h2>
          <small>Accounts similar to you that are currently performing better</small>
        </div>
        <CompetitorLeaderboard rows={rows} onOpen={setOpen} onTrack={track} expanded={expanded} onExpandedChange={setExpanded} />
      </section>

      {/* ---------- 2 + 3 + 4: most similar · why · winning content ---------- */}
      <div className="cw-trio">
        <section className="cw-panel">
          <div className="cp4-sec-head">
            <h2>Most similar competitor <Info size={13} className="cw-info" /></h2>
          </div>
          {pick && you ? (
            <>
              <p className="cw-sub">Highly similar to your account and outperforming you across key metrics.</p>
              <div className="cw-pick">
                {pick.row.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pick.row.avatar} alt="" width={44} height={44} />
                ) : <span className="cp4-face ph">{pick.row.name[0]?.toUpperCase()}</span>}
                <span className="cw-pick-id">
                  <b>{pick.row.name}</b>
                  <small>@{pick.row.handle}</small>
                </span>
                <span className="cw-match" title={pick.row.match != null ? "SOCIA relevance score: niche, locality, comparable audience and verified metrics" : "Similarity from classification and audience proximity"}>
                  {pick.similarity}% match
                </span>
              </div>
              <div className="cw-tags">
                {pick.row.classification && <span>{CLASSIFICATION_LABEL[pick.row.classification as Classification] ?? pick.row.classification}</span>}
                <span>{pick.row.platform === "youtube" ? "YouTube" : pick.row.platform === "facebook" ? "Facebook" : "Instagram"}</span>
                <span>Leads on {pick.leads} of {pick.comparisons.filter((c) => c.diffPct != null).length} comparable metrics</span>
              </div>
              <table className="cw-cmp-table">
                <thead><tr><th>Metric</th><th>You</th><th>{pick.row.name.split(" ")[0]}</th><th>Difference</th></tr></thead>
                <tbody>
                  {pick.comparisons.map((c) => (
                    <tr key={c.key}>
                      <td>{c.label}</td>
                      <td>{fmtC(c, c.you)}</td>
                      <td>{fmtC(c, c.them)}</td>
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
                </tbody>
              </table>
              <div className="cw-actions">
                <button type="button" className="btn-primary" onClick={() => setOpen(pick.row)}>View full comparison</button>
                <a href={`/chat?q=${encodeURIComponent(analyzeQ)}`}>Analyze this competitor <ArrowRight size={13} /></a>
              </div>
            </>
          ) : (
            <p className="cp4-empty">
              No similar account is measurably outperforming you yet. This fills in as SOCIA discovers
              competitors with public metrics, or when Facebook is connected for Instagram competitor data.
            </p>
          )}
        </section>

        <section className="cw-panel">
          <div className="cp4-sec-head"><h2>What they&apos;re doing well</h2></div>
          {observations.length ? (
            <ul className="cw-obs">
              {observations.map((o) => (
                <li key={o.key}>
                  <b>{o.title}</b>
                  <p>{o.detail}</p>
                </li>
              ))}
              <li className="cw-learn">
                <b>What you can take from this</b>
                <p>
                  Each line above is a measured gap. Start with the largest one — it&apos;s the change most likely to
                  move your numbers, and the AI Strategist can turn it into a plan.
                </p>
              </li>
            </ul>
          ) : (
            <p className="cp4-empty">Observations appear once a similar competitor with public metrics is found.</p>
          )}
          {pick && (
            <a className="cw-link" href={`/chat?q=${encodeURIComponent(analyzeQ)}`}>See winning content <ArrowRight size={13} /></a>
          )}
        </section>

        <section className="cw-panel cw-content">
          <div className="cp4-sec-head">
            <h2>Winning content <small>(last 30 days)</small></h2>
          </div>
          {winning.length ? (
            <div className="cw-cards">
              {winning.map((w) => {
                const ask = `Break down why this ${w.platform === "youtube" ? "YouTube video" : "Reel"} worked: "${w.title ?? w.url}"${w.accountName ? ` by ${w.accountName}` : ""}${w.multiplier ? `, which did ${w.multiplier.toFixed(1)}× that creator's usual views` : ""}. Then give me a version I could make for my own account.`;
                return (
                  <article className="cw-card" key={w.url}>
                    <a className="cw-thumb" href={w.url} target="_blank" rel="noreferrer">
                      {w.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={w.thumbnailUrl} alt="" loading="lazy" />
                      ) : <span className="cw-thumb-ph"><Play size={18} /></span>}
                      <span className="cw-badge">{w.platform === "youtube" ? "Shorts" : w.platform === "facebook" ? "Facebook" : "Reels"}</span>
                    </a>
                    <b className="cw-title">{w.title ?? "(untitled)"}</b>
                    <small className="cw-creator">{w.accountName ?? "Unknown creator"}</small>
                    <div className="cw-stats">
                      <span><Play size={11} /> {fmtN(w.views)}</span>
                      <span><Heart size={11} /> {fmtN(w.likes)}</span>
                      <span><MessageCircle size={11} /> {fmtN(w.comments)}</span>
                    </div>
                    {w.multiplier != null && w.multiplier >= 1.2 ? (
                      <small className="cw-mult" title="This post's views divided by the creator's own median across recent uploads — both real public numbers.">
                        {w.multiplier.toFixed(1)}× their median
                      </small>
                    ) : (
                      <small className="cw-mult muted">Baseline not available</small>
                    )}
                    <small className="cw-date">
                      {w.publishedAt ? new Date(w.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Date not published"}
                    </small>
                    <div className="cw-card-actions">
                      <a href={w.url} target="_blank" rel="noreferrer">View original</a>
                      <a className="strong" href={`/chat?q=${encodeURIComponent(ask)}`}>Analyze why it worked</a>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="cp4-empty">No competitor content found yet — run Refresh to search your niche.</p>
          )}
        </section>
      </div>

      {/* ---------- 5. discovered for you ---------- */}
      <section className="cw-block cw-disc">
        <div className="cp4-sec-head">
          <h2>Discovered for you</h2>
          <small>Accounts SOCIA found automatically · beyond the six above</small>
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
                  <b>{r.name}</b>
                  <small>
                    {r.platform === "youtube" ? "YouTube" : r.platform === "facebook" ? "Facebook" : "Instagram"}
                    {" · "}
                    {r.audience.state === "ok" ? `${fmtN(r.audience.value)} ${r.platform === "youtube" ? "subscribers" : "followers"}` : "followers not published"}
                    {r.match != null && ` · ${r.match}% match`}
                  </small>
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
        {beyond > 4 && !expanded && (
          <button type="button" className="cw-link" onClick={() => { setExpanded(true); document.querySelector(".lb")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
            Explore {beyond} more accounts <ArrowRight size={13} />
          </button>
        )}
      </section>

      {open && you && <DetailDrawer r={open} you={you} onClose={() => setOpen(null)} />}
    </>
  );
}

function DetailDrawer({ r, you, onClose }: { r: LeaderRow; you: LeaderRow; onClose: () => void }) {
  const base: Omit<Comparison, "diffPct">[] = [
    { key: "audience", label: "Audience", you: you.audience, them: r.audience, unit: "count" },
    { key: "engagement", label: "Engagement rate", you: you.engagement, them: r.engagement, unit: "pct" },
    { key: "cadence", label: "Posts / week", you: you.cadence, them: r.cadence, unit: "perWeek" },
    { key: "medianViews", label: "Median views", you: you.medianViews, them: r.medianViews, unit: "count" },
  ];
  const cmp: Comparison[] = base.map((c) => ({
    ...c,
    diffPct: c.you.state === "ok" && c.them.state === "ok" && c.you.value ? ((c.them.value! - c.you.value) / c.you.value) * 100 : null,
  }));
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
            <small>@{r.handle} · {r.platform === "youtube" ? "YouTube" : r.platform === "facebook" ? "Facebook" : "Instagram"}{r.match != null && ` · ${r.match}% match`}</small>
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
