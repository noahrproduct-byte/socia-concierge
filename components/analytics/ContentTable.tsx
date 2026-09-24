"use client";

// Recent Content Performance — a sortable, filterable table across platforms.
// Each cell shows exactly what the platform returned; an absent metric is "—",
// never 0. The vs-typical column is the post's multiplier against its own
// account's like-with-like baseline (green above, red below), blank until a
// baseline exists.

import { useMemo, useState } from "react";
import type { NormalizedPost, Platform } from "@/lib/analytics/types";
import { platformCapability } from "@/lib/analytics/capabilities";

const TINT: Record<Platform, string> = { instagram: "#d6357a", youtube: "#e0332a", facebook: "#1877f2", tiktok: "#22d3ee" };
const fmtN = (v: number | null | undefined): string => (v == null ? "—" : v >= 1e6 ? `${(v / 1e6).toFixed(1).replace(/\.0$/, "")}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1).replace(/\.0$/, "")}K` : v.toLocaleString("en-US"));
const fmtMult = (x: number) => `${x >= 10 ? x.toFixed(0) : x.toFixed(1)}×`;
type Sort = "views" | "recent" | "typical";

export default function ContentTable({ posts, onOpen }: { posts: NormalizedPost[]; onOpen?: (p: NormalizedPost) => void }) {
  const platforms = useMemo(() => Array.from(new Set(posts.map((p) => p.platform))), [posts]);
  const [filter, setFilter] = useState<Platform | "all">("all");
  const [sort, setSort] = useState<Sort>("views");

  const rows = useMemo(() => {
    const base = filter === "all" ? posts : posts.filter((p) => p.platform === filter);
    const sorted = [...base].sort((a, b) => {
      if (sort === "recent") return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      if (sort === "typical") return (b.multiplier ?? -1) - (a.multiplier ?? -1);
      return (b.metrics.views ?? b.engagement ?? -1) - (a.metrics.views ?? a.engagement ?? -1);
    });
    return sorted.slice(0, 12);
  }, [posts, filter, sort]);

  if (!posts.length) return <p className="uni-chart-note uni-empty-block">No posts synced for this account yet.</p>;

  return (
    <div className="uni-ctable-wrap">
      <div className="uni-ctable-head">
        {platforms.length > 1 && (
          <div className="uni-seg">
            <button className={`uni-seg-b${filter === "all" ? " on" : ""}`} onClick={() => setFilter("all")}>All</button>
            {platforms.map((p) => (
              <button key={p} className={`uni-seg-b${filter === p ? " on" : ""}`} onClick={() => setFilter(p)}>{platformCapability(p).label}</button>
            ))}
          </div>
        )}
        <label className="uni-sortby">
          Sort by
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="views">Most views</option>
            <option value="recent">Most recent</option>
            <option value="typical">vs. typical</option>
          </select>
        </label>
      </div>
      <table className="uni-ctable">
        <thead>
          <tr><th className="l">Content</th><th className="l">Platform</th><th className="l">Published</th><th>Views</th><th>Likes</th><th>Comments</th><th>vs. Typical</th></tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={`${p.platform}-${p.id}`} className={onOpen ? "uni-ct-clickable" : undefined} onClick={onOpen ? () => onOpen(p) : undefined}>
              <td className="l">
                <span className="uni-ct-content">
                  <span className="uni-ct-thumb" style={{ backgroundImage: p.thumb ? `url(${p.thumb})` : undefined }} />
                  <span className="uni-ct-title">{p.title || "(no caption)"}</span>
                </span>
              </td>
              <td className="l"><span className="uni-ct-plat"><span className="uni-legend-dot" style={{ background: TINT[p.platform] }} />{platformCapability(p.platform).label}</span></td>
              <td className="l">{new Date(p.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
              <td>{fmtN(p.metrics.views)}</td>
              <td>{fmtN(p.metrics.likes)}</td>
              <td>{fmtN(p.metrics.comments)}</td>
              <td>{p.multiplier != null ? <span className={`uni-ct-mult ${p.multiplier >= 1 ? "up" : "down"}`}>{fmtMult(p.multiplier)}</span> : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
