"use client";

// Posting-time evidence: weekday × 3-hour heatmap of median relative
// performance, the best windows with sample sizes and confidence, and the
// weekday / hour rollups. Computed in the browser so hours are the viewer's.
// Below the minimum sample it says so instead of guessing.

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { buildWindows, relText, blockLabel, blockShort, DOW, DOW_LONG, MIN_POSTS, RELIABLE_N, SIGNAL_N, BLOCK_STARTS, type TimedPost, type Windows } from "@/lib/postingTimes";

export type Format = "all" | "Reel" | "Photo" | "Carousel";

export function useWindows(posts: TimedPost[], format: Format): Windows {
  return useMemo(() => buildWindows(format === "all" ? posts : posts.filter((p) => p.format === format)), [posts, format]);
}

export function WindowsList({ w, compact = false }: { w: Windows; compact?: boolean }) {
  if (!w.enough) {
    return (
      <div className="ov-empty small">
        <b>Not enough posts yet to identify a reliable best time.</b>
        <p>SOCIA needs at least {MIN_POSTS} dated posts with engagement; this sample has {w.posts}. It updates automatically as more posts are analyzed.</p>
      </div>
    );
  }
  if (!w.best.length) {
    return (
      <div className="ov-empty small">
        <b>No window stands out yet.</b>
        <p>Across {w.posts} posts, no weekday-and-hour block with {SIGNAL_N}+ posts beat your median by 10% or more. Keep posting at varied times and this fills in.</p>
      </div>
    );
  }
  return (
    <ol className={`pt-windows${compact ? " compact" : ""}`}>
      {w.best.map((b, i) => (
        <li key={`${b.day}-${b.block}`}>
          <span className="pt-rank">{i + 1}</span>
          <span className="pt-win-body">
            <b>{DOW_LONG[b.day]} · {blockLabel(b.block)}</b>
            <small>{b.n} post{b.n === 1 ? "" : "s"} analyzed · {relText(b.rel)}</small>
          </span>
          <em className={`ov-chip ${b.confidence === "high" ? "success" : "warning"}`}>{b.confidence === "high" ? "High confidence" : "Early signal"}</em>
        </li>
      ))}
    </ol>
  );
}

export default function PostingHeatmap({ posts, formats }: { posts: TimedPost[]; formats: Record<string, number> }) {
  const [format, setFormat] = useState<Format>("all");
  const [cell, setCell] = useState<{ d: number; b: number } | null>(null);
  const w = useWindows(posts, format);
  const options: Format[] = ["all", ...(["Reel", "Photo", "Carousel"] as const).filter((f) => (formats[f] ?? 0) >= MIN_POSTS)];
  const c = cell ? w.cells[cell.d][cell.b] : null;
  const shade = (rel: number | null, n: number) => {
    if (n === 0 || rel == null) return 0;
    const t = Math.max(0, Math.min(1, (rel - 0.5) / Math.max(1, w.maxRel - 0.5)));
    return n < SIGNAL_N ? 0.18 + t * 0.2 : 0.3 + t * 0.7;
  };
  return (
    <div className="pt">
      <div className="pt-head">
        <div className="ov-seg" role="tablist" aria-label="Content type">
          {options.map((f) => (
            <button key={f} type="button" role="tab" aria-selected={format === f} className={format === f ? "on" : ""} onClick={() => { setFormat(f); setCell(null); }}>{f === "all" ? "All content" : `${f}s`}</button>
          ))}
        </div>
        <span className="ov-range-label">{w.posts} post{w.posts === 1 ? "" : "s"} · your time zone</span>
      </div>
      <div className="pt-grid-wrap">
        <div className="pt-grid" role="grid" aria-label="Median performance by weekday and time">
          <span className="pt-corner" />
          {BLOCK_STARTS.map((_, b) => <span key={b} className="pt-col">{blockShort(b)}</span>)}
          {w.cells.map((row, d) => (
            <div key={d} className="pt-row" role="row">
              <span className="pt-rowlab">{DOW[d]}</span>
              {row.map((x) => {
                const on = cell?.d === x.day && cell?.b === x.block;
                const best = w.best.some((bw) => bw.day === x.day && bw.block === x.block);
                return (
                  <button key={x.block} type="button" role="gridcell" className={`pt-cell${on ? " on" : ""}${best ? " best" : ""}`}
                    style={{ "--h": shade(x.rel, x.n) } as React.CSSProperties}
                    aria-label={`${DOW_LONG[x.day]} ${blockLabel(x.block)}: ${x.n ? `${x.n} posts, ${x.rel != null ? relText(x.rel) : "no median"}` : "no posts"}`}
                    onMouseEnter={() => setCell({ d: x.day, b: x.block })} onFocus={() => setCell({ d: x.day, b: x.block })} onClick={() => setCell({ d: x.day, b: x.block })}>
                    {x.n > 0 && <i>{x.n}</i>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="pt-detail" aria-live="polite">
          {c ? (
            <>
              <b>{DOW_LONG[c.day]}</b>
              <span>{blockLabel(c.block)}</span>
              {c.n === 0 ? <p>No posts published in this window yet.</p> : (
                <dl>
                  <div><dt>Median interactions</dt><dd>{c.median != null ? Math.round(c.median).toLocaleString("en-US") : "—"}</dd></div>
                  <div><dt>Posts analyzed</dt><dd>{c.n}</dd></div>
                  <div><dt>Performance</dt><dd className={c.rel != null && c.rel >= 1 ? "up" : "down"}>{c.rel != null ? relText(c.rel) : "—"}</dd></div>
                  <div><dt>Confidence</dt><dd>{c.n >= RELIABLE_N ? "High" : c.n >= SIGNAL_N ? "Early signal" : "One post only"}</dd></div>
                </dl>
              )}
            </>
          ) : (
            <p className="pt-detail-hint">Hover or select a block. Numbers are the post count; colour is the median performance of those posts against your typical post ({w.baseline != null ? `${Math.round(w.baseline).toLocaleString("en-US")} interactions` : "not enough data"}).</p>
          )}
        </div>
      </div>
      <div className="pt-two">
        <section>
          <h3>Best windows</h3>
          <WindowsList w={w} />
        </section>
        <section>
          <h3>By weekday</h3>
          <Rollup rows={w.byDay.map((r) => ({ label: DOW_LONG[r.index], ...r }))} />
          <h3 className="pt-h-gap">By time of day</h3>
          <Rollup rows={w.byBlock.map((r) => ({ label: blockLabel(r.index), ...r }))} />
        </section>
      </div>
      {w.enough && w.best.length > 0 && (
        <p className="ov-source">Medians of each window's posts against your median post, in your time zone. A window needs {SIGNAL_N} posts to be ranked and {RELIABLE_N} for high confidence. Where a post lands is not proof the hour caused its result. <Link href="/calendar" className="ov-link"><CalendarPlus size={12} /> Schedule into a window</Link></p>
      )}
    </div>
  );
}

function Rollup({ rows }: { rows: { label: string; n: number; median: number | null; rel: number | null }[] }) {
  const max = Math.max(1, ...rows.map((r) => (r.n >= SIGNAL_N && r.rel != null ? r.rel : 0)));
  return (
    <ul className="pt-rollup">
      {rows.map((r) => (
        <li key={r.label} className={r.n < SIGNAL_N ? "thin" : ""}>
          <span className="pt-rl-label">{r.label}</span>
          <span className="pt-rl-track"><i style={{ width: `${r.n >= SIGNAL_N && r.rel != null ? Math.round((r.rel / max) * 100) : 0}%` }} /></span>
          <b>{r.n >= SIGNAL_N && r.rel != null ? relText(r.rel) : r.n === 0 ? "no posts" : `${r.n} post${r.n === 1 ? "" : "s"}, too few`}</b>
          <small>{r.n >= SIGNAL_N ? `${r.n} posts` : ""}</small>
        </li>
      ))}
    </ul>
  );
}
