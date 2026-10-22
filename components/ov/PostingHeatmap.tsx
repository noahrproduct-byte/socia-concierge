"use client";

// Posting-time evidence: weekday × 3-hour heatmap of median relative
// performance, the best windows with sample sizes and confidence, and the
// weekday / hour rollups. Computed in the browser so hours are the viewer's.
// Below the minimum sample it says so instead of guessing.
// Drawn with .s-heat and .s-bars (app/styles/charts.css); page shapes from analytics.css.

import "@/app/styles/charts.css";
import "@/app/(app)/analytics/analytics.css";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { SegmentedControl, StatusPill } from "@/components/system";
import { buildWindows, relText, blockLabel, blockShort, DOW, DOW_LONG, MIN_POSTS, RELIABLE_N, SIGNAL_N, BLOCK_STARTS, type TimedPost, type Windows } from "@/lib/postingTimes";

export type Format = "all" | "Reel" | "Photo" | "Carousel";

const DASH = String.fromCharCode(0x2014);

export function useWindows(posts: TimedPost[], format: Format): Windows {
  return useMemo(() => buildWindows(format === "all" ? posts : posts.filter((p) => p.format === format)), [posts, format]);
}

/** `compact` is kept for callers (BestTimes); the dense list reads the same at every size. */
export function WindowsList({ w }: { w: Windows; compact?: boolean }) {
  if (!w.enough) {
    return (
      <div className="s-empty">
        <b>Not enough posts yet to identify a reliable best time.</b>
        <p>SOCIA needs at least {MIN_POSTS} dated posts with engagement; this sample has {w.posts}. It updates automatically as more posts are analyzed.</p>
      </div>
    );
  }
  if (!w.best.length) {
    return (
      <div className="s-empty">
        <b>No window stands out yet.</b>
        <p>Across {w.posts} posts, no weekday-and-hour block with {SIGNAL_N}+ posts beat your median by 10% or more. Keep posting at varied times and this fills in.</p>
      </div>
    );
  }
  return (
    <ol className="an-list">
      {w.best.map((b, i) => (
        <li key={`${b.day}-${b.block}`}>
          <span className="an-gap-rank">{i + 1}</span>
          <span className="an-row-body">
            <b>{DOW_LONG[b.day]} · {blockLabel(b.block)}</b>
            <small>{b.n} post{b.n === 1 ? "" : "s"} analyzed · {relText(b.rel)}</small>
          </span>
          <StatusPill tone={b.confidence === "high" ? "positive" : "warning"}>{b.confidence === "high" ? "High confidence" : "Early signal"}</StatusPill>
        </li>
      ))}
    </ol>
  );
}

/** `unit` names what each post's score is ("interactions" on Instagram and
 *  Facebook, "views" on YouTube) so the copy never mislabels the basis. */
export default function PostingHeatmap({ posts, formats, unit = "interactions" }: { posts: TimedPost[]; formats: Record<string, number>; unit?: string }) {
  const [format, setFormat] = useState<Format>("all");
  const [cell, setCell] = useState<{ d: number; b: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const w = useWindows(posts, format);
  const options: Format[] = ["all", ...(["Reel", "Photo", "Carousel"] as const).filter((f) => (formats[f] ?? 0) >= MIN_POSTS)];
  const c = cell ? w.cells[cell.d][cell.b] : null;
  const shade = (rel: number | null, n: number) => {
    if (n === 0 || rel == null) return 0;
    const t = Math.max(0, Math.min(1, (rel - 0.5) / Math.max(1, w.maxRel - 0.5)));
    return n < SIGNAL_N ? 0.18 + t * 0.2 : 0.3 + t * 0.7;
  };
  const days = w.cells.length;
  const cols = BLOCK_STARTS.length;
  // One tab stop in the grid: the chosen cell, else the best window, else Monday's first block.
  const stop = cell ?? (w.best[0] ? { d: w.best[0].day, b: w.best[0].block } : { d: 0, b: 0 });
  const onCellKey = (e: KeyboardEvent<HTMLButtonElement>, d: number, b: number) => {
    let nd = d, nb = b;
    if (e.key === "ArrowRight") nb = Math.min(cols - 1, b + 1);
    else if (e.key === "ArrowLeft") nb = Math.max(0, b - 1);
    else if (e.key === "ArrowDown") nd = Math.min(days - 1, d + 1);
    else if (e.key === "ArrowUp") nd = Math.max(0, d - 1);
    else if (e.key === "Home") nb = 0;
    else if (e.key === "End") nb = cols - 1;
    else return;
    e.preventDefault();
    setCell({ d: nd, b: nb });
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${nd}-${nb}"]`)?.focus();
  };

  return (
    <div className="an-stack">
      <div className="an-head">
        <SegmentedControl
          className="s-seg--sm"
          label="Content type"
          value={format}
          onChange={(f) => { setFormat(f); setCell(null); }}
          options={options.map((f) => ({ value: f, label: f === "all" ? "All content" : `${f}s` }))}
        />
        <span className="an-head-end s-hint">{w.posts} post{w.posts === 1 ? "" : "s"} · your time zone</span>
      </div>
      <div className="an-heat-wrap">
        <div ref={gridRef} className="s-heat" style={{ "--heat-cols": cols } as React.CSSProperties} role="grid" aria-label="Median performance by weekday and time">
          <div className="s-heat-row" role="row">
            <span className="s-heat-corner" role="columnheader" aria-label="Weekday" />
            {BLOCK_STARTS.map((_, b) => <span key={b} className="s-heat-col" role="columnheader" aria-label={blockLabel(b)}>{blockShort(b)}</span>)}
          </div>
          {w.cells.map((row, d) => (
            <div key={d} className="s-heat-row" role="row">
              <span className="s-heat-rowlab" role="rowheader" aria-label={DOW_LONG[d]}>{DOW[d]}</span>
              {row.map((x) => {
                const on = cell?.d === x.day && cell?.b === x.block;
                const best = w.best.some((bw) => bw.day === x.day && bw.block === x.block);
                const h = shade(x.rel, x.n);
                return (
                  <button key={x.block} type="button" role="gridcell" data-cell={`${x.day}-${x.block}`}
                    tabIndex={stop.d === x.day && stop.b === x.block ? 0 : -1}
                    aria-selected={on}
                    className={`s-heat-cell${x.n > 0 ? " has-data" : ""}${h > 0.55 ? " is-strong" : ""}${best ? " is-best" : ""}${on ? " is-on" : ""}`}
                    style={{ "--h": h } as React.CSSProperties}
                    aria-label={`${DOW_LONG[x.day]} ${blockLabel(x.block)}: ${x.n ? `${x.n} posts, ${x.rel != null ? relText(x.rel) : "no median"}` : "no posts"}${best ? ", a best window" : ""}`}
                    onMouseEnter={() => setCell({ d: x.day, b: x.block })} onFocus={() => setCell({ d: x.day, b: x.block })} onClick={() => setCell({ d: x.day, b: x.block })}
                    onKeyDown={(e) => onCellKey(e, x.day, x.block)}>
                    {x.n > 0 && <i>{x.n}</i>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="an-heat-detail" aria-live="polite">
          {c ? (
            <>
              <b>{DOW_LONG[c.day]}</b>
              <span>{blockLabel(c.block)}</span>
              {c.n === 0 ? <p>No posts published in this window yet.</p> : (
                <dl className="an-stats">
                  <div><dt>Median {unit}</dt><dd className={c.median != null ? undefined : "is-na"}>{c.median != null ? Math.round(c.median).toLocaleString("en-US") : DASH}</dd></div>
                  <div><dt>Posts analyzed</dt><dd>{c.n}</dd></div>
                  <div><dt>Performance</dt><dd className={c.rel == null ? "is-na" : c.rel >= 1 ? "is-good" : "is-bad"}>{c.rel != null ? relText(c.rel) : DASH}</dd></div>
                  <div><dt>Confidence</dt><dd>{c.n >= RELIABLE_N ? "High" : c.n >= SIGNAL_N ? "Early signal" : "One post only"}</dd></div>
                </dl>
              )}
            </>
          ) : (
            <p>Hover or select a block. Numbers are the post count; colour is the median performance of those posts against your typical post ({w.baseline != null ? `${Math.round(w.baseline).toLocaleString("en-US")} ${unit}` : "not enough data"}).</p>
          )}
        </div>
      </div>
      <div className="an-two">
        <section>
          <h3 className="s-section-title">Best windows</h3>
          <WindowsList w={w} />
        </section>
        <section className="an-col">
          <div>
            <h3 className="s-section-title">By weekday</h3>
            <Rollup rows={w.byDay.map((r) => ({ label: DOW_LONG[r.index], ...r }))} />
          </div>
          <div>
            <h3 className="s-section-title">By time of day</h3>
            <Rollup rows={w.byBlock.map((r) => ({ label: blockLabel(r.index), ...r }))} />
          </div>
        </section>
      </div>
      {w.enough && w.best.length > 0 && (
        <p className="s-source">Medians of each window&apos;s posts against your median post, in your time zone. A window needs {SIGNAL_N} posts to be ranked and {RELIABLE_N} for high confidence. Where a post lands is not proof the hour caused its result. <Link href="/calendar" className="s-link"><CalendarPlus size={12} aria-hidden /> Schedule into a window</Link></p>
      )}
    </div>
  );
}

function Rollup({ rows }: { rows: { label: string; n: number; median: number | null; rel: number | null }[] }) {
  const max = Math.max(1, ...rows.map((r) => (r.n >= SIGNAL_N && r.rel != null ? r.rel : 0)));
  return (
    <ul className="s-bars">
      {rows.map((r) => {
        const ranked = r.n >= SIGNAL_N && r.rel != null;
        return (
          <li key={r.label} className={r.n < SIGNAL_N ? "is-thin" : undefined}>
            <span>{r.label}</span>
            <span className="s-bars-track" aria-hidden><i style={{ width: `${ranked ? Math.round((r.rel! / max) * 100) : 0}%` }} /></span>
            <b>
              {ranked ? relText(r.rel!) : r.n === 0 ? "no posts" : `${r.n} post${r.n === 1 ? "" : "s"}, too few`}
              {r.n >= SIGNAL_N && <small>{r.n} posts</small>}
            </b>
          </li>
        );
      })}
    </ul>
  );
}
