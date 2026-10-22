"use client";

// Content library: filter and sort across every synced post, as dense aligned
// rows. Values come from the server exactly as Instagram returned them; a dash
// means Instagram did not provide that number for the post, never zero.

import "@/app/(app)/analytics/analytics.css";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, CalendarPlus, ChevronDown, ChevronUp, ExternalLink, Sparkles } from "lucide-react";
import { ButtonLink, Card, Chip, Empty, SegmentedControl, StatusPill, TableWrap, Unavailable, buttonClass, type SegmentOption } from "@/components/system";

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

const fmt = (n: number): string =>
  n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M"
  : n >= 1e4 ? Math.round(n / 1e3) + "K"
  : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K"
  : String(n);

const NOT_RETURNED = "Instagram did not return this for the post";

function displayTitle(caption: string): string {
  const firstLine = caption.split("\n")[0].trim();
  const withoutTags = firstLine.replace(/(\s*#[\p{L}\p{N}_]+)+\s*$/u, "").trim();
  return withoutTags || firstLine || "(no caption)";
}

type Col = { key: keyof LibraryPost; label: string; num?: boolean };
const COLS: Col[] = [
  { key: "caption", label: "Content" },
  { key: "published", label: "Published" },
  { key: "format", label: "Format" },
  { key: "views", label: "Views", num: true },
  { key: "reach", label: "Reach", num: true },
  { key: "likes", label: "Likes", num: true },
  { key: "comments", label: "Comments", num: true },
  { key: "saves", label: "Saves", num: true },
  { key: "shares", label: "Shares", num: true },
  { key: "engagements", label: "Engagements", num: true },
  { key: "multiplier", label: "vs baseline", num: true },
];

type Sort = { col: keyof LibraryPost; dir: 1 | -1 };

/** The quick sorts in the segmented control. Any column header sorts too. */
const PRESETS: { value: string; label: string; sort: Sort }[] = [
  { value: "new", label: "Newest", sort: { col: "published", dir: -1 } },
  { value: "old", label: "Oldest", sort: { col: "published", dir: 1 } },
  { value: "views", label: "Most views", sort: { col: "views", dir: -1 } },
  { value: "eng", label: "Most engagement", sort: { col: "engagements", dir: -1 } },
  { value: "mult", label: "Best vs baseline", sort: { col: "multiplier", dir: -1 } },
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

function metric(n: number | null) {
  return n == null ? <Unavailable reason={NOT_RETURNED} compact /> : fmt(n);
}

export default function ContentLibrary({ posts, embedded = false }: { posts: LibraryPost[]; embedded?: boolean }) {
  const [format, setFormat] = useState("all");
  const [sort, setSort] = useState<Sort>({ col: "published", dir: -1 });

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

  // The segmented control always shows the sort in force: a header sort that
  // no preset covers appears as its own segment, and choosing it flips it.
  const preset = PRESETS.find((p) => p.sort.col === sort.col && p.sort.dir === sort.dir);
  const current = COLS.find((c) => c.key === sort.col);
  const textCol = !current?.num && sort.col !== "published";
  const customLabel = `${current?.label ?? "Custom"}, ${textCol ? (sort.dir === 1 ? "A to Z" : "Z to A") : sort.dir === -1 ? "high to low" : "low to high"}`;
  const sortOptions: SegmentOption<string>[] = [
    ...PRESETS.map((p) => ({ value: p.value, label: p.label })),
    ...(preset ? [] : [{ value: "custom", label: customLabel }]),
  ];
  const onSort = (v: string) => {
    if (v === "custom") return toggle(sort.col);
    const p = PRESETS.find((x) => x.value === v);
    if (p) setSort(p.sort);
  };

  const formatOptions: SegmentOption<string>[] = formats.map((f) => ({ value: f, label: f === "all" ? "All formats" : f + "s" }));

  const body = (
    <>
      {posts.length > 0 && (
        <div className="an-controls">
          <div className="s-query">
            <div className="s-query-item">
              <small>Format</small>
              <SegmentedControl className="s-seg--sm" label="Format" options={formatOptions} value={format} onChange={setFormat} />
            </div>
            <div className="s-query-item">
              <small>Sort</small>
              <SegmentedControl className="s-seg--sm" label="Sort" options={sortOptions} value={preset?.value ?? "custom"} onChange={onSort} />
            </div>
          </div>
          <span className="an-head-end">
            <span className="s-card-period" aria-live="polite">
              {totals.count} posts · {totals.engagements.toLocaleString("en-US")} engagements
              {totals.views != null && <> · {fmt(totals.views)} views</>}
            </span>
          </span>
        </div>
      )}

      {posts.length === 0 ? (
        <Empty>
          <b>No posts synced yet.</b> Posts appear here after SOCIA&apos;s next sync with Instagram.
        </Empty>
      ) : (
        <TableWrap>
          <table className="s-table s-table--stack">
            <thead>
              <tr>
                {COLS.map((c) => {
                  const on = sort.col === c.key;
                  return (
                    <th
                      key={String(c.key)}
                      scope="col"
                      className={[c.num ? "num" : "", on ? "sorted" : ""].filter(Boolean).join(" ") || undefined}
                      aria-sort={on ? (sort.dir === -1 ? "descending" : "ascending") : "none"}
                    >
                      <button type="button" className="an-th-sort" onClick={() => toggle(c.key)}>
                        {c.label}
                        {on && (sort.dir === -1 ? <ChevronDown size={14} aria-hidden /> : <ChevronUp size={14} aria-hidden />)}
                      </button>
                    </th>
                  );
                })}
                <th scope="col" className="act">
                  <span className="s-sr">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const title = displayTitle(p.caption);
                return (
                  <tr key={p.id}>
                    <td>
                      <span className="an-cell-media">
                        {p.thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img className="an-thumb" src={p.thumb} alt="" width={40} height={40} loading="lazy" />
                        ) : (
                          <span className="an-thumb" aria-hidden />
                        )}
                        <span className="an-cell-title" title={p.caption}>{title}</span>
                      </span>
                    </td>
                    <td data-label="Published">
                      {new Date(p.published).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
                    </td>
                    <td data-label="Format">
                      <Chip>{p.format}</Chip>
                    </td>
                    <td className="num" data-label="Views">{metric(p.views)}</td>
                    <td className="num" data-label="Reach">{metric(p.reach)}</td>
                    <td className="num" data-label="Likes">{metric(p.likes)}</td>
                    <td className="num" data-label="Comments">{metric(p.comments)}</td>
                    <td className="num" data-label="Saves">{metric(p.saves)}</td>
                    <td className="num" data-label="Shares">{metric(p.shares)}</td>
                    <td className="num key" data-label="Engagements">{p.engagements.toLocaleString("en-US")}</td>
                    <td className="num" data-label="vs baseline">
                      {p.multiplier != null ? (
                        <StatusPill tone={p.multiplier >= 1 ? "positive" : "neutral"}>
                          {p.multiplier >= 1 ? <ArrowUp aria-hidden /> : <ArrowDown aria-hidden />}
                          {p.multiplier.toFixed(1)}×
                        </StatusPill>
                      ) : (
                        <Unavailable reason="SOCIA needs more posts to know your baseline" compact />
                      )}
                    </td>
                    <td className="act">
                      <ButtonLink
                        href={`/chat?q=${encodeURIComponent(whyQuestion(p))}`}
                        variant="ghost"
                        size="sm"
                        title="Ask SOCIA about this post"
                        data-ask-context={JSON.stringify({ page: "post", postId: p.id })}
                        data-ask-label={`Post: ${title.slice(0, 40)}`}
                        data-ask-send="1"
                      >
                        <Sparkles aria-hidden /> Why
                      </ButtonLink>
                      <ButtonLink
                        href={`/calendar?compose=1&caption=${encodeURIComponent(title)}`}
                        variant="ghost"
                        size="sm"
                        title="Open a calendar draft that follows up on this post"
                      >
                        <CalendarPlus aria-hidden /> Follow-up
                      </ButtonLink>
                      {p.permalink && (
                        <a href={p.permalink} target="_blank" rel="noreferrer" className={buttonClass("ghost", "sm", true)} aria-label="Open on Instagram" title="Open on Instagram">
                          <ExternalLink aria-hidden />
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}
    </>
  );

  if (embedded) return <div>{body}</div>;
  return <Card>{body}</Card>;
}
