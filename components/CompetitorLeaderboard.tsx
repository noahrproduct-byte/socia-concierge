"use client";

// The competitor table — the page's first and largest component.
//
// Six rows by default, sorted by how similar each account is to the user,
// because the question is "who is like me and doing better", not "who is
// biggest". Every cell either shows a value with its provenance or the reason
// it has none; the four reasons are not interchangeable and are never a bare
// dash where a real explanation exists.

import { useMemo, useState } from "react";
import { ArrowUpDown, ExternalLink, Search, Plus, Check, Loader2 } from "lucide-react";
import { CELL_REASON, SOURCE_LABEL, type Cell, type LeaderRow } from "@/lib/competitorRollup";
import { CLASSIFICATION_LABEL, type Classification } from "@/lib/discovery";

const fmtN = (n: number | null | undefined): string =>
  n == null ? "—"
  : n >= 1e9 ? (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B"
  : n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M"
  : n >= 1e4 ? Math.round(n / 1e3) + "K"
  : n.toLocaleString("en-US");

export type SortKey = "match" | "audience" | "engagement" | "cadence" | "medianViews";
export type Filter = "all" | "direct" | "similar" | "growing" | "engaging" | "active";
type Plat = "all" | "instagram" | "youtube" | "facebook";

const PICK: Record<Exclude<SortKey, "match">, (r: LeaderRow) => Cell> = {
  audience: (r) => r.audience,
  engagement: (r) => r.engagement,
  cadence: (r) => r.cadence,
  medianViews: (r) => r.medianViews,
};

/** One cell. A missing value shows why it is missing. */
function C({ c, fmt }: { c: Cell; fmt?: (n: number) => string }) {
  if (c.state === "ok" && c.value != null) {
    return (
      <span
        className="lb-val"
        title={c.source ? `${SOURCE_LABEL[c.source]}${c.sample ? ` · from ${c.sample} posts` : ""}` : undefined}
      >
        {fmt ? fmt(c.value) : fmtN(c.value)}
      </span>
    );
  }
  const reason = CELL_REASON[c.state as Exclude<Cell["state"], "ok">];
  return (
    <span className={`lb-absent${c.state === "connection_needed" ? " needs" : ""}`} title={reason}>
      {c.state === "unknown" ? "—" : reason}
    </span>
  );
}

export default function CompetitorLeaderboard({
  rows,
  onOpen,
  onTrack,
  expanded,
  onExpandedChange,
}: {
  rows: LeaderRow[];
  onOpen: (r: LeaderRow) => void;
  onTrack: (r: LeaderRow) => Promise<void>;
  expanded: boolean;
  onExpandedChange: (v: boolean) => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "match", dir: -1 });
  const [filter, setFilter] = useState<Filter>("all");
  const [plat, setPlat] = useState<Plat>("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [justTracked, setJustTracked] = useState<Set<string>>(new Set());

  // The user's own row is context for comparison elsewhere, not a competitor.
  const competitors = useMemo(() => rows.filter((r) => !r.isYou), [rows]);

  const counts = useMemo<Record<Filter, number>>(() => ({
    all: competitors.length,
    direct: competitors.filter((r) => r.classification === "direct_competitor" || r.classification === "local_competitor").length,
    similar: competitors.filter((r) => r.match != null).length,
    growing: competitors.filter((r) => r.momentum.state === "ok").length,
    engaging: competitors.filter((r) => r.engagement.state === "ok").length,
    active: competitors.filter((r) => r.cadence.state === "ok").length,
  }), [competitors]);

  const filtered = useMemo(() => {
    let xs = competitors;
    if (plat !== "all") xs = xs.filter((r) => r.platform === plat);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      xs = xs.filter((r) => r.name.toLowerCase().includes(needle) || r.handle.toLowerCase().includes(needle));
    }
    switch (filter) {
      case "direct": xs = xs.filter((r) => r.classification === "direct_competitor" || r.classification === "local_competitor"); break;
      case "similar": xs = xs.filter((r) => r.match != null); break;
      case "growing": xs = xs.filter((r) => r.momentum.state === "ok"); break;
      case "engaging": xs = xs.filter((r) => r.engagement.state === "ok"); break;
      case "active": xs = xs.filter((r) => r.cadence.state === "ok"); break;
      default: break;
    }
    const effKey: SortKey = filter === "similar" ? "match"
      : filter === "engaging" && sort.key === "match" ? "engagement"
      : filter === "active" && sort.key === "match" ? "cadence"
      : sort.key;
    const val = (r: LeaderRow): number | null =>
      effKey === "match" ? r.match : PICK[effKey](r).value;
    return [...xs].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      // Unmeasured rows sink in either direction — they must never top a ranking.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * sort.dir;
    });
  }, [competitors, plat, q, filter, sort]);

  const shown = expanded ? filtered : filtered.slice(0, 6);
  const hidden = filtered.length - shown.length;

  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: -1 }));

  const track = async (r: LeaderRow) => {
    if (busy) return;
    setBusy(r.id);
    try {
      await onTrack(r);
      setJustTracked((s) => new Set(s).add(r.id));
    } finally {
      setBusy(null);
    }
  };

  const FILTERS: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "direct", label: "Direct" },
    { id: "similar", label: "Most similar" },
    { id: "growing", label: "Fastest growing" },
    { id: "engaging", label: "Highest engagement" },
    { id: "active", label: "Most active" },
  ];

  const Th = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <th className={`lb-num sortable${sort.key === k ? " on" : ""}`} onClick={() => toggle(k)} aria-sort={sort.key === k ? (sort.dir === -1 ? "descending" : "ascending") : "none"}>
      {children} <ArrowUpDown size={11} />
    </th>
  );

  return (
    <div className="lb">
      <div className="lb-bar">
        <span className="lb-filters" role="tablist">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className={filter === f.id ? "on" : ""} onClick={() => setFilter(f.id)}>
              {f.label} <em>({counts[f.id]})</em>
            </button>
          ))}
        </span>
        <span className="lb-right">
          <span className="cp4-chipset">
            {(["all", "instagram", "youtube", "facebook"] as Plat[]).map((p) => (
              <button key={p} type="button" className={`cp4-chip${plat === p ? " on" : ""}`} onClick={() => setPlat(p)}>
                {p === "all" ? "All" : p === "youtube" ? "YouTube" : p === "instagram" ? "Instagram" : "Facebook"}
              </button>
            ))}
          </span>
          <label className="lb-search">
            <Search size={13} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search competitors…" aria-label="Search competitors" />
          </label>
        </span>
      </div>

      <div className="lb-wrap">
        <table className="lb-table">
          <thead>
            <tr>
              <th className="lb-rank">#</th>
              <th>Competitor</th>
              <Th k="match">Niche match</Th>
              <Th k="audience">Followers</Th>
              <Th k="engagement">Engagement</Th>
              <Th k="cadence">Posts / wk</Th>
              <Th k="medianViews">Median views</Th>
              <th className="lb-num">30d growth</th>
              <th>Top format</th>
              <th></th>
            </tr>
          </thead>
          <tbody key={`${filter}-${plat}-${sort.key}-${sort.dir}`} className="lb-body">
            {shown.map((r, i) => (
              <tr key={r.id} className="lb-row" tabIndex={0} onClick={() => onOpen(r)} onKeyDown={(e) => e.key === "Enter" && onOpen(r)}>
                <td className="lb-rank">{String(i + 1).padStart(2, "0")}</td>
                <td>
                  <span className="lb-acct">
                    {r.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.avatar} alt="" width={30} height={30} />
                    ) : (
                      <span className="lb-ph">{r.name[0]?.toUpperCase() ?? "?"}</span>
                    )}
                    <span className="lb-names">
                      <b>{r.name}</b>
                      <small>@{r.handle} <i className={`lb-dot ${r.platform}`} title={r.platform} /></small>
                    </span>
                  </span>
                </td>
                <td className="lb-num">
                  {r.match != null ? (
                    <span className="lb-match">
                      <b>{r.match}%</b>
                      <small>{r.classification ? CLASSIFICATION_LABEL[r.classification as Classification] ?? r.classification : "Tracked"}</small>
                    </span>
                  ) : (
                    <span className="lb-match">
                      <b className="muted">—</b>
                      <small>{r.tracked ? "Added by you" : "Not scored"}</small>
                    </span>
                  )}
                </td>
                <td className="lb-num"><C c={r.audience} /></td>
                <td className="lb-num"><C c={r.engagement} fmt={(n) => `${n.toFixed(1)}%`} /></td>
                <td className="lb-num"><C c={r.cadence} fmt={(n) => n.toFixed(1)} /></td>
                <td className="lb-num"><C c={r.medianViews} /></td>
                <td className="lb-num">
                  <span className="lb-absent" title="SOCIA doesn't hold follower history for this account yet — no platform publishes it for accounts you don't own, so growth is measured only from snapshots SOCIA records itself.">—</span>
                </td>
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
                  {r.url && (
                    <a href={r.url} target="_blank" rel="noreferrer" aria-label={`Open ${r.name}`}><ExternalLink size={12} /></a>
                  )}
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={10} className="lb-empty">
                  {filter === "growing"
                    ? "SOCIA doesn't hold growth history for these accounts yet."
                    : "No accounts match this filter."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="lb-foot">
        <small>Showing {shown.length} of {filtered.length} competitors</small>
        {hidden > 0 && (
          <button type="button" className="lb-more" onClick={() => onExpandedChange(true)}>
            View all {filtered.length} competitors →
          </button>
        )}
        {expanded && filtered.length > 6 && (
          <button type="button" className="lb-more" onClick={() => onExpandedChange(false)}>Show top 6</button>
        )}
      </div>
    </div>
  );
}
