"use client";

// The leaderboard — the page's centrepiece.
//
// A table rather than a wall of cards, because comparing eight accounts on
// five metrics is a table's job. Sorting, filtering, search and the platform
// switcher all operate on real rows; a cell that has no value shows the
// reason it has none, and those reasons are not interchangeable.

import { useMemo, useState } from "react";
import { ArrowUpDown, ExternalLink, Search, Plus, Check, Loader2 } from "lucide-react";
import {
  CELL_REASON, SOURCE_LABEL, type Cell, type LeaderRow,
} from "@/lib/competitorRollup";

const fmtN = (n: number | null | undefined): string =>
  n == null ? "—"
  : n >= 1e9 ? (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B"
  : n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M"
  : n >= 1e4 ? Math.round(n / 1e3) + "K"
  : n.toLocaleString("en-US");

type SortKey = "audience" | "engagement" | "cadence" | "medianViews";
type Filter = "all" | "direct" | "growing" | "engaging" | "active";
type Plat = "all" | "instagram" | "youtube" | "facebook";

const PICK: Record<SortKey, (r: LeaderRow) => Cell> = {
  audience: (r) => r.audience,
  engagement: (r) => r.engagement,
  cadence: (r) => r.cadence,
  medianViews: (r) => r.medianViews,
};

/** One cell. Never renders a bare dash where a real reason exists. */
function C({ c, fmt }: { c: Cell; fmt?: (n: number) => string }) {
  if (c.state === "ok" && c.value != null) {
    return (
      <span
        className="lb-val"
        title={
          c.source
            ? `${SOURCE_LABEL[c.source]}${c.sample ? ` · from ${c.sample} observations` : ""}`
            : undefined
        }
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
}: {
  rows: LeaderRow[];
  onOpen: (r: LeaderRow) => void;
  onTrack: (r: LeaderRow) => Promise<void>;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "audience", dir: -1 });
  const [filter, setFilter] = useState<Filter>("all");
  const [plat, setPlat] = useState<Plat>("all");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [justTracked, setJustTracked] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    let xs = rows;
    if (plat !== "all") xs = xs.filter((r) => r.isYou || r.platform === plat);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      xs = xs.filter(
        (r) => r.name.toLowerCase().includes(needle) || r.handle.toLowerCase().includes(needle),
      );
    }
    switch (filter) {
      case "direct":
        xs = xs.filter((r) => r.isYou || r.classification === "direct_competitor" || r.classification === "local_competitor");
        break;
      case "growing":
        xs = xs.filter((r) => r.isYou || r.momentum.state === "ok");
        break;
      case "engaging":
        xs = xs.filter((r) => r.isYou || r.engagement.state === "ok");
        break;
      case "active":
        xs = xs.filter((r) => r.isYou || r.cadence.state === "ok");
        break;
      default:
        break;
    }

    const pick = PICK[sort.key];
    return [...xs].sort((a, b) => {
      const av = pick(a).value;
      const bv = pick(b).value;
      // Rows without the sorted metric sink, whichever direction is chosen —
      // an unmeasured account should never top a ranking.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * sort.dir;
    });
  }, [rows, plat, q, filter, sort]);

  const shown = expanded ? filtered : filtered.slice(0, 8);
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
    { id: "growing", label: "Fastest growing" },
    { id: "engaging", label: "Highest engagement" },
    { id: "active", label: "Most active" },
  ];

  return (
    <div className="lb">
      <div className="lb-bar">
        <span className="cp4-chipset">
          {(["all", "instagram", "youtube", "facebook"] as Plat[]).map((p) => (
            <button key={p} type="button" className={`cp4-chip${plat === p ? " on" : ""}`} onClick={() => setPlat(p)}>
              {p === "all" ? "All platforms" : p === "youtube" ? "YouTube" : p === "instagram" ? "Instagram" : "Facebook"}
            </button>
          ))}
        </span>
        <span className="lb-filters">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className={filter === f.id ? "on" : ""} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </span>
        <label className="lb-search">
          <Search size={13} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search competitors…" aria-label="Search competitors" />
        </label>
      </div>

      <div className="lb-wrap">
        <table className="lb-table">
          <thead>
            <tr>
              <th className="lb-rank">#</th>
              <th>Account</th>
              <th>Platform</th>
              <th className="lb-num sortable" onClick={() => toggle("audience")}>
                Audience <ArrowUpDown size={11} />
              </th>
              <th className="lb-num sortable" onClick={() => toggle("engagement")}>
                Engagement <ArrowUpDown size={11} />
              </th>
              <th className="lb-num sortable" onClick={() => toggle("cadence")}>
                Posts / wk <ArrowUpDown size={11} />
              </th>
              <th className="lb-num sortable" onClick={() => toggle("medianViews")}>
                Median views <ArrowUpDown size={11} />
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr
                key={r.id}
                className={`lb-row${r.isYou ? " you" : ""}`}
                tabIndex={0}
                onClick={() => onOpen(r)}
                onKeyDown={(e) => e.key === "Enter" && onOpen(r)}
              >
                <td className="lb-rank">{String(i + 1).padStart(2, "0")}</td>
                <td>
                  <span className="lb-acct">
                    {r.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.avatar} alt="" width={26} height={26} />
                    ) : (
                      <span className="lb-ph">{r.name[0]?.toUpperCase() ?? "?"}</span>
                    )}
                    <span className="lb-names">
                      <b>{r.name}</b>
                      <small>@{r.handle}</small>
                    </span>
                    {r.isYou && <span className="cp4-tag you">YOU</span>}
                  </span>
                </td>
                <td><span className={`cp4-plat ${r.platform}`}>{r.platform === "youtube" ? "YouTube" : r.platform === "facebook" ? "Facebook" : "Instagram"}</span></td>
                <td className="lb-num"><C c={r.audience} /></td>
                <td className="lb-num"><C c={r.engagement} fmt={(n) => `${n.toFixed(1)}%`} /></td>
                <td className="lb-num"><C c={r.cadence} fmt={(n) => n.toFixed(1)} /></td>
                <td className="lb-num"><C c={r.medianViews} /></td>
                <td className="lb-act" onClick={(e) => e.stopPropagation()}>
                  {r.isYou ? null : r.tracked || justTracked.has(r.id) ? (
                    <span className="lb-tracked"><Check size={12} /> Tracked</span>
                  ) : (
                    <button type="button" onClick={() => track(r)} disabled={busy === r.id}>
                      {busy === r.id ? <Loader2 size={11} className="cp4-spin" /> : <Plus size={11} />} Track
                    </button>
                  )}
                  {r.url && (
                    <a href={r.url} target="_blank" rel="noreferrer" aria-label={`Open ${r.name}`}>
                      <ExternalLink size={12} />
                    </a>
                  )}
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={8} className="lb-empty">No accounts match this filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {hidden > 0 && (
        <button type="button" className="lb-more" onClick={() => setExpanded(true)}>
          View all {filtered.length} competitors
        </button>
      )}
      {expanded && filtered.length > 8 && (
        <button type="button" className="lb-more" onClick={() => setExpanded(false)}>
          Show top 8 only
        </button>
      )}
    </div>
  );
}
