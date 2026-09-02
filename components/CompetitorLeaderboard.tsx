"use client";

// The competitor table — the page's primary component.
//
// One quiet toolbar (Sort / Platform / Type + search), six rows per page,
// row selection that drives the intelligence panels below. Every cell is a
// value with provenance or the reason it is absent. When a row's metrics are
// all gated behind the Meta connection, that is said ONCE across the metric
// columns — repeating "Connection required" five times reads as broken.

import { useEffect, useMemo, useState } from "react";
import { ArrowUpDown, ExternalLink, Search, Plus, Check, Loader2, Link2, ChevronLeft, ChevronRight } from "lucide-react";
import { CELL_REASON, SOURCE_LABEL, type Cell, type LeaderRow } from "@/lib/competitorRollup";
import { CLASSIFICATION_LABEL, type Classification } from "@/lib/discovery";

const fmtN = (n: number | null | undefined): string =>
  n == null ? "—"
  : n >= 1e9 ? (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B"
  : n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M"
  : n >= 1e4 ? Math.round(n / 1e3) + "K"
  : Math.round(n).toLocaleString("en-US");

export type SortKey = "relevant" | "similar" | "engagement" | "growing" | "active" | "audience";
type Plat = "all" | "instagram" | "youtube" | "facebook";
type TypeFilter = "all" | Classification;

const SORTS: { id: SortKey; label: string }[] = [
  { id: "relevant", label: "Most relevant" },
  { id: "similar", label: "Most similar" },
  { id: "engagement", label: "Highest engagement" },
  { id: "growing", label: "Fastest growing" },
  { id: "active", label: "Most active" },
  { id: "audience", label: "Largest audience" },
];
const TYPES: { id: TypeFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "direct_competitor", label: "Direct competitor" },
  { id: "local_competitor", label: "Local competitor" },
  { id: "niche_leader", label: "Niche leader" },
  { id: "emerging_creator", label: "Emerging" },
  { id: "adjacent_competitor", label: "Adjacent" },
];
const PAGE = 6;

const sortValue = (r: LeaderRow, k: SortKey): number | null =>
  k === "relevant" || k === "similar" ? r.match
  : k === "engagement" ? r.engagement.value
  : k === "growing" ? r.momentum.value
  : k === "active" ? r.cadence.value
  : r.audience.value;

/** One cell. A missing value shows why it is missing. */
function C({ c, fmt }: { c: Cell; fmt?: (n: number) => string }) {
  if (c.state === "ok" && c.value != null) {
    return (
      <span className="lb-val" title={c.source ? `${SOURCE_LABEL[c.source]}${c.sample ? ` · from ${c.sample} posts` : ""}` : undefined}>
        {fmt ? fmt(c.value) : fmtN(c.value)}
      </span>
    );
  }
  const reason = CELL_REASON[c.state as Exclude<Cell["state"], "ok">];
  return <span className="lb-absent" title={reason}>{c.state === "unknown" ? "—" : reason}</span>;
}

const PlatIcon = ({ p }: { p: LeaderRow["platform"] }) => (
  <i className={`lb-dot ${p}`} title={p === "youtube" ? "YouTube" : p === "facebook" ? "Facebook" : "Instagram"} aria-label={p} />
);

export default function CompetitorLeaderboard({
  rows,
  selectedId,
  onSelect,
  onOpen,
  onTrack,
  expanded,
  onExpandedChange,
}: {
  rows: LeaderRow[];
  selectedId: string | null;
  onSelect: (r: LeaderRow) => void;
  onOpen: (r: LeaderRow) => void;
  onTrack: (r: LeaderRow) => Promise<void>;
  expanded: boolean;
  onExpandedChange: (v: boolean) => void;
}) {
  const [sort, setSort] = useState<SortKey>("relevant");
  const [dir, setDir] = useState<1 | -1>(-1);
  const [plat, setPlat] = useState<Plat>("all");
  const [type, setType] = useState<TypeFilter>("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [justTracked, setJustTracked] = useState<Set<string>>(new Set());

  const competitors = useMemo(() => rows.filter((r) => !r.isYou), [rows]);

  const filtered = useMemo(() => {
    let xs = competitors;
    if (plat !== "all") xs = xs.filter((r) => r.platform === plat);
    if (type !== "all") xs = xs.filter((r) => r.classification === type);
    if (q.trim()) {
      const n = q.trim().toLowerCase();
      xs = xs.filter((r) => r.name.toLowerCase().includes(n) || r.handle.toLowerCase().includes(n));
    }
    return [...xs].sort((a, b) => {
      const av = sortValue(a, sort);
      const bv = sortValue(b, sort);
      // Unmeasured rows sink in either direction — never top a ranking.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * dir;
    });
  }, [competitors, plat, type, q, sort, dir]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  useEffect(() => { setPage(1); }, [sort, dir, plat, type, q, expanded]);
  const shown = expanded ? filtered : filtered.slice((page - 1) * PAGE, page * PAGE);

  const headerSort = (k: SortKey) => {
    if (sort === k) setDir((d) => (d * -1) as 1 | -1);
    else { setSort(k); setDir(-1); }
  };

  const track = async (r: LeaderRow) => {
    if (busy) return;
    setBusy(r.id);
    try { await onTrack(r); setJustTracked((s) => new Set(s).add(r.id)); }
    finally { setBusy(null); }
  };

  const Th = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <th
      className={`lb-num sortable${sort === k ? " on" : ""}`}
      onClick={() => headerSort(k)}
      aria-sort={sort === k ? (dir === -1 ? "descending" : "ascending") : "none"}
    >
      {children} <ArrowUpDown size={11} />
    </th>
  );

  const pageButtons = Array.from({ length: Math.min(pages, 5) }, (_, i) => i + 1);

  return (
    <div className="lb">
      {/* ---- toolbar ---- */}
      <div className="lb-bar" role="toolbar" aria-label="Competitor filters">
        <label className="lb-sel">
          <span>Sort:</span>
          <select value={sort} onChange={(e) => { setSort(e.target.value as SortKey); setDir(-1); }} aria-label="Sort competitors">
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="lb-sel">
          <span>Platform:</span>
          <select value={plat} onChange={(e) => setPlat(e.target.value as Plat)} aria-label="Filter by platform">
            <option value="all">All</option>
            <option value="instagram">Instagram</option>
            <option value="youtube">YouTube</option>
            <option value="facebook">Facebook</option>
          </select>
        </label>
        <label className="lb-sel">
          <span>Type:</span>
          <select value={type} onChange={(e) => setType(e.target.value as TypeFilter)} aria-label="Filter by competitor type">
            {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        <label className="lb-search">
          <Search size={13} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search competitors…" aria-label="Search competitors" />
        </label>
      </div>

      {/* ---- table ---- */}
      <div className="lb-wrap">
        <table className="lb-table">
          <thead>
            <tr>
              <th className="lb-rank">#</th>
              <th>Competitor</th>
              <Th k="similar">Match</Th>
              <Th k="audience">Followers</Th>
              <Th k="engagement">Engagement</Th>
              <Th k="active">Posts / week</Th>
              <th className="lb-num">Median views</th>
              <Th k="growing">30d growth</Th>
              <th>Top format</th>
              <th className="lb-act-h">Actions</th>
            </tr>
          </thead>
          <tbody key={`${sort}-${dir}-${plat}-${type}-${q}-${page}-${expanded}`} className="lb-body">
            {shown.map((r, i) => {
              const gated =
                r.audience.state === "connection_needed" && r.engagement.state === "connection_needed" &&
                r.cadence.state === "connection_needed" && r.medianViews.state === "connection_needed";
              const idx = (expanded ? 0 : (page - 1) * PAGE) + i + 1;
              const selected = r.id === selectedId;
              return (
                <tr
                  key={r.id}
                  className={`lb-row${selected ? " selected" : ""}`}
                  tabIndex={0}
                  aria-selected={selected}
                  onClick={() => onSelect(r)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(r); } }}
                >
                  <td className="lb-rank">{String(idx).padStart(2, "0")}</td>
                  <td>
                    <span className="lb-acct">
                      {r.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.avatar} alt="" width={32} height={32} />
                      ) : <span className="lb-ph">{r.name[0]?.toUpperCase() ?? "?"}</span>}
                      <span className="lb-names">
                        <b title={r.name}>{r.name}</b>
                        <small title={`@${r.handle}`}>@{r.handle} <PlatIcon p={r.platform} /></small>
                      </span>
                    </span>
                  </td>
                  <td className="lb-num">
                    <span className="lb-match">
                      {r.match != null ? <b>{r.match}%</b> : <b className="muted">—</b>}
                      <small>
                        {r.classification ? CLASSIFICATION_LABEL[r.classification as Classification] ?? r.classification
                          : r.tracked ? "Added by you" : "Not scored"}
                      </small>
                    </span>
                  </td>
                  {gated ? (
                    <td className="lb-gated" colSpan={5} onClick={(e) => e.stopPropagation()}>
                      <span className="lb-gated-msg">
                        <Link2 size={13} /> Meta competitor metrics unavailable
                        <a href="/settings#accounts">Connect Meta</a>
                      </span>
                    </td>
                  ) : (
                    <>
                      <td className="lb-num"><C c={r.audience} /></td>
                      <td className="lb-num"><C c={r.engagement} fmt={(n) => `${n.toFixed(1)}%`} /></td>
                      <td className="lb-num"><C c={r.cadence} fmt={(n) => n.toFixed(1)} /></td>
                      <td className="lb-num"><C c={r.medianViews} /></td>
                      <td className="lb-num">
                        <span className="lb-absent" title="No platform publishes follower history for accounts you don't own. Growth appears only once SOCIA has recorded this account over time.">—</span>
                      </td>
                    </>
                  )}
                  <td>{r.topFormat ? <span className="lb-format">{r.topFormat}</span> : <span className="lb-absent">—</span>}</td>
                  <td className="lb-act" onClick={(e) => e.stopPropagation()}>
                    {r.tracked || justTracked.has(r.id) ? (
                      <span className="lb-tracked"><Check size={12} /> Tracked</span>
                    ) : (
                      <button type="button" onClick={() => track(r)} disabled={busy === r.id}>
                        {busy === r.id ? <Loader2 size={11} className="cp4-spin" /> : <Plus size={11} />} Track
                      </button>
                    )}
                    <button type="button" className="lb-view" onClick={() => onOpen(r)}>View</button>
                    {r.url && <a href={r.url} target="_blank" rel="noreferrer" aria-label={`Open ${r.name}`}><ExternalLink size={12} /></a>}
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr><td colSpan={10} className="lb-empty">
                {sort === "growing" ? "SOCIA doesn't hold growth history for these accounts yet." : "No competitors match these filters."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ---- pagination ---- */}
      <div className="lb-foot">
        <small>Showing {shown.length} of {filtered.length} competitors</small>
        {!expanded && pages > 1 && (
          <nav className="lb-pages" aria-label="Competitor pages">
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}><ChevronLeft size={13} /> Previous</button>
            {pageButtons.map((n) => (
              <button key={n} type="button" className={page === n ? "on" : ""} onClick={() => setPage(n)} aria-current={page === n ? "page" : undefined}>{n}</button>
            ))}
            <button type="button" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages}>Next <ChevronRight size={13} /></button>
          </nav>
        )}
        {filtered.length > PAGE && (
          <button type="button" className="lb-more" onClick={() => onExpandedChange(!expanded)}>
            {expanded ? "Show 6 per page" : `View all ${filtered.length} competitors →`}
          </button>
        )}
      </div>
    </div>
  );
}
