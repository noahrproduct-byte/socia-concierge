"use client";

// Content library: filter + sort across every synced post. Values come from
// the server exactly as Instagram returned them; "—" means not provided.

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, ExternalLink, Sparkles, CalendarPlus } from "lucide-react";

export type LibraryPost = {
  id: string;
  caption: string;
  published: string;
  format: string;
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
  engagements: number;
  engRate: number | null;
  multiplier: number | null;
  thumb: string | null;
  permalink: string | null;
};

const fmt = (n: number | null): string =>
  n == null ? "—"
  : n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M"
  : n >= 1e4 ? Math.round(n / 1e3) + "K"
  : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K"
  : String(n);

function displayTitle(caption: string): string {
  const firstLine = caption.split("\n")[0].trim();
  const withoutTags = firstLine.replace(/(\s*#[\p{L}\p{N}_]+)+\s*$/u, "").trim();
  return withoutTags || firstLine || "(no caption)";
}

const COLS: { key: keyof LibraryPost; label: string; num?: boolean }[] = [
  { key: "caption", label: "Content" },
  { key: "published", label: "Published" },
  { key: "format", label: "Format" },
  { key: "views", label: "Views", num: true },
  { key: "reach", label: "Reach", num: true },
  { key: "likes", label: "Likes", num: true },
  { key: "comments", label: "Comments", num: true },
  { key: "saves", label: "Saves", num: true },
  { key: "engagements", label: "Engagements", num: true },
  { key: "multiplier", label: "vs baseline", num: true },
];

/** The question the Strategist opens with for one post: its real numbers, no guesses. */
function whyQuestion(p: LibraryPost): string {
  const nums = [
    p.views != null ? `${p.views.toLocaleString("en-US")} views` : null,
    p.reach != null ? `${p.reach.toLocaleString("en-US")} reach` : null,
    `${p.engagements.toLocaleString("en-US")} engagements`,
    p.multiplier != null ? `${p.multiplier.toFixed(1)}× my baseline` : null,
  ].filter(Boolean);
  const when = new Date(p.published).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `Why did my ${p.format.toLowerCase()} "${displayTitle(p.caption)}" (${when}, ${nums.join(", ")}) perform the way it did, and what should I do next with it?`;
}

export default function ContentLibrary({ posts, embedded = false }: { posts: LibraryPost[]; embedded?: boolean }) {
  const [format, setFormat] = useState("all");
  const [sort, setSort] = useState<{ col: keyof LibraryPost; dir: 1 | -1 }>({
    col: "published",
    dir: -1,
  });

  const formats = useMemo(() => ["all", ...new Set(posts.map((p) => p.format))], [posts]);

  const rows = useMemo(() => {
    const filtered = format === "all" ? posts : posts.filter((p) => p.format === format);
    return [...filtered].sort((a, b) => {
      const av = a[sort.col];
      const bv = b[sort.col];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (sort.col === "published") {
        return (new Date(av as string).getTime() - new Date(bv as string).getTime()) * sort.dir;
      }
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * sort.dir;
      return String(av).localeCompare(String(bv)) * sort.dir;
    });
  }, [posts, format, sort]);

  const totals = useMemo(() => {
    const withViews = rows.filter((r) => r.views != null);
    return {
      count: rows.length,
      views: withViews.length ? withViews.reduce((s, r) => s + (r.views ?? 0), 0) : null,
      engagements: rows.reduce((s, r) => s + r.engagements, 0),
    };
  }, [rows]);

  function toggle(col: keyof LibraryPost) {
    setSort((s) => (s.col === col ? { col, dir: (s.dir * -1) as 1 | -1 } : { col, dir: -1 }));
  }

  return (
    <section className={embedded ? "lib-embedded" : "dsh-panel dsh-tablewrap"}>
      <div className="dsh-panel-head">
        <div className="lib-filters">
          {formats.map((f) => (
            <button key={f} className={format === f ? "on" : ""} onClick={() => setFormat(f)}>
              {f === "all" ? "All formats" : f + "s"}
            </button>
          ))}
        </div>
        <span className="lib-totals">
          {totals.count} posts · {totals.engagements.toLocaleString("en-US")} engagements
          {totals.views != null && <> · {fmt(totals.views)} views</>}
        </span>
      </div>

      <div className="dsh-tablescroll">
        <table className="dsh-table">
          <thead>
            <tr>
              {COLS.map((c) => (
                <th
                  key={String(c.key)}
                  className={c.num ? "num" : ""}
                  onClick={() => toggle(c.key)}
                  aria-sort={sort.col === c.key ? (sort.dir === -1 ? "descending" : "ascending") : "none"}
                >
                  {c.label}
                  {sort.col === c.key && (sort.dir === -1 ? <ChevronDown size={12} /> : <ChevronUp size={12} />)}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>
                  <span className="dsh-cell-content">
                    {p.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.thumb} alt="" width={32} height={32} loading="lazy" />
                    ) : (
                      <span className="dsh-top-thumb ph" aria-hidden />
                    )}
                    <b title={p.caption}>{displayTitle(p.caption)}</b>
                  </span>
                </td>
                <td className="muted">
                  {new Date(p.published).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
                </td>
                <td className="muted">{p.format}</td>
                <td className="num">{fmt(p.views)}</td>
                <td className="num">{fmt(p.reach)}</td>
                <td className="num">{fmt(p.likes)}</td>
                <td className="num">{fmt(p.comments)}</td>
                <td className="num">{fmt(p.saves)}</td>
                <td className="num">{p.engagements.toLocaleString("en-US")}</td>
                <td className="num">
                  {p.multiplier != null ? (
                    <span className={p.multiplier >= 1 ? "up" : "down"}>
                      {p.multiplier >= 1 ? "↑" : "↓"} {p.multiplier.toFixed(1)}×
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="num">
                  <span className="lib-actions">
                    <Link
                      href={`/chat?q=${encodeURIComponent(whyQuestion(p))}`}
                      className="lib-act"
                      title="Ask SOCIA about this post"
                      data-ask-context={JSON.stringify({ page: "post", postId: p.id })}
                      data-ask-label={`Post: ${displayTitle(p.caption).slice(0, 40)}`}
                      data-ask-send="1"
                    >
                      <Sparkles size={11} /> Why
                    </Link>
                    <Link
                      href={`/calendar?compose=1&caption=${encodeURIComponent(displayTitle(p.caption))}`}
                      className="lib-act ghost"
                      title="Open a calendar draft that follows up on this post"
                    >
                      <CalendarPlus size={11} /> Follow-up
                    </Link>
                    {p.permalink && (
                      <a href={p.permalink} target="_blank" rel="noreferrer" className="dsh-link lib-open" aria-label="Open on Instagram">
                        <ExternalLink size={13} />
                      </a>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
