"use client";

// The competitor roster — the page's entry point. One horizontal row: the
// user's own card first, then the competitors SOCIA actively compares, with
// the next card peeking in from the right so the scroll is discoverable.
// Native overflow scrolling plus working arrows; no autoplay, no loop.
//
// Every number on a card is a value with provenance or an honest absence.
// A card whose metrics are all gated behind the Meta connection says so once.

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Link2 } from "lucide-react";
import { CELL_REASON, type Cell, type LeaderRow } from "@/lib/competitorRollup";
import { CLASSIFICATION_LABEL, type Classification } from "@/lib/discovery";

const fmtN = (n: number | null | undefined): string =>
  n == null ? "—"
  : n >= 1e9 ? (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B"
  : n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M"
  : n >= 1e4 ? Math.round(n / 1e3) + "K"
  : Math.round(n).toLocaleString("en-US");

const val = (c: Cell, fmt?: (n: number) => string): string =>
  c.state === "ok" && c.value != null ? (fmt ? fmt(c.value) : fmtN(c.value))
  : c.state === "unknown" ? "—" : CELL_REASON[c.state as Exclude<Cell["state"], "ok">];

const platName = (p: string) => (p === "youtube" ? "YouTube" : p === "facebook" ? "Facebook" : "Instagram");

export default function CompetitorRoster({
  you,
  rows,
  selectedId,
  onSelect,
}: {
  you: LeaderRow | undefined;
  rows: LeaderRow[];
  selectedId: string | null;
  onSelect: (r: LeaderRow) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
  }, [update, rows.length]);

  const step = (dirn: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>(".cr-card");
    el.scrollBy({ left: ((card?.offsetWidth ?? 220) + 12) * dirn, behavior: "smooth" });
  };

  // Keyboard: arrows move focus between cards; Enter/Space selects.
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const cards = [...(ref.current?.querySelectorAll<HTMLElement>(".cr-card[tabindex]") ?? [])];
    const i = cards.indexOf(document.activeElement as HTMLElement);
    const next = cards[i + (e.key === "ArrowRight" ? 1 : -1)];
    if (next) { e.preventDefault(); next.focus(); next.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" }); }
  };

  return (
    <div className="cr-wrap">
      {canLeft && (
        <button type="button" className="cr-arrow left" onClick={() => step(-1)} aria-label="Previous competitors">
          <ChevronLeft size={16} />
        </button>
      )}
      <div className="cr-scroll" ref={ref} role="listbox" aria-label="Competitors in your niche" onKeyDown={onKey}>
        {you && (
          <article className="cr-card you" aria-label="Your account">
            <span className="cr-you">YOU</span>
            <div className="cr-head">
              {you.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={you.avatar} alt="" width={44} height={44} />
              ) : <span className="cr-ph">{you.name[0]?.toUpperCase()}</span>}
              <span className="cr-id">
                <b title={you.name}>{you.name}</b>
                <small title={`@${you.handle}`}>@{you.handle} <i className={`lb-dot ${you.platform}`} /></small>
              </span>
            </div>
            <div className="cr-metrics">
              <span><b>{val(you.audience)}</b><small>Followers</small></span>
              <span><b>{val(you.engagement, (n) => `${n.toFixed(1)}%`)}</b><small>Engagement</small></span>
              <span><b>{val(you.cadence, (n) => n.toFixed(1))}</b><small>Posts/week</small></span>
            </div>
          </article>
        )}

        {rows.map((r) => {
          const gated =
            r.audience.state === "connection_needed" && r.engagement.state === "connection_needed" &&
            r.cadence.state === "connection_needed";
          const selected = r.id === selectedId;
          return (
            <article
              key={r.id}
              className={`cr-card${selected ? " selected" : ""}`}
              role="option"
              aria-selected={selected}
              tabIndex={0}
              onClick={() => onSelect(r)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(r); } }}
            >
              <div className="cr-head">
                {r.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.avatar} alt="" width={44} height={44} />
                ) : <span className="cr-ph">{r.name[0]?.toUpperCase() ?? "?"}</span>}
                <span className="cr-id">
                  <b title={r.name}>{r.name}</b>
                  <small title={`@${r.handle}`}>@{r.handle} <i className={`lb-dot ${r.platform}`} title={platName(r.platform)} /></small>
                </span>
              </div>
              <div className="cr-class">
                {r.classification && (
                  <span className={`cr-chip ${r.classification}`}>
                    {CLASSIFICATION_LABEL[r.classification as Classification] ?? r.classification}
                  </span>
                )}
                {r.tracked && <span className="cr-chip tracked">Tracked</span>}
              </div>
              <div className="cr-match">
                {r.match != null ? <><b>{r.match}%</b> match</> : <span className="muted">Not scored</span>}
              </div>
              {gated ? (
                <div className="cr-gated" onClick={(e) => e.stopPropagation()}>
                  <Link2 size={12} /> Metrics need Meta connection
                  <a href="/settings#accounts">Connect</a>
                </div>
              ) : (
                <div className="cr-metrics">
                  <span><b>{val(r.audience)}</b><small>{r.platform === "youtube" ? "Subscribers" : "Followers"}</small></span>
                  <span><b>{val(r.engagement, (n) => `${n.toFixed(1)}%`)}</b><small>Engagement</small></span>
                  <span>
                    {r.topFormat
                      ? <><b>{r.topFormat}</b><small>Top format</small></>
                      : <><b>{val(r.cadence, (n) => n.toFixed(1))}</b><small>Posts/week</small></>}
                  </span>
                </div>
              )}
            </article>
          );
        })}
      </div>
      {canRight && (
        <button type="button" className="cr-arrow right" onClick={() => step(1)} aria-label="Next competitors">
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
}
