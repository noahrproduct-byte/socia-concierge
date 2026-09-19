"use client";

// The competitor selector: compact chips, your account pinned first, rank
// badges computed from published engagement rates only. Clicking a chip
// re-derives every section below without a reload. Native overflow scrolling,
// arrows, and arrow-key navigation; never autoplays.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Link2 } from "lucide-react";
import type { LeaderRow } from "@/lib/competitorRollup";
import type { CompetitorRow } from "@/lib/competitorIntel";
import { Avatar, PlatformMark, classLabel, fmtN } from "./shared";

export default function Roster({ you, rows, ranks, youRank, selectedId, onSelect, connectHref }: {
  you: LeaderRow | null; rows: CompetitorRow[];
  /** id → rank among accounts with a published engagement rate. */
  ranks: Record<string, number>; youRank: number | null;
  selectedId: string | null; onSelect: (id: string) => void; connectHref: string;
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
    const card = el.querySelector<HTMLElement>(".cx2-chip-card");
    el.scrollBy({ left: ((card?.offsetWidth ?? 190) + 10) * 2 * dirn, behavior: "smooth" });
  };
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const cards = [...(ref.current?.querySelectorAll<HTMLElement>(".cx2-chip-card[tabindex]") ?? [])];
    const i = cards.indexOf(document.activeElement as HTMLElement);
    const next = cards[i + (e.key === "ArrowRight" ? 1 : -1)];
    if (next) { e.preventDefault(); next.focus(); next.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" }); }
  };

  return (
    <div className="cx2-roster">
      {canLeft && <button type="button" className="cx-arrow left" onClick={() => step(-1)} aria-label="Previous competitors"><ChevronLeft size={15} /></button>}
      <div className="cx2-rscroll" ref={ref} role="listbox" aria-label="Competitors" onKeyDown={onKey}>
        <article className="cx2-chip-card you cx2-rise" aria-label="Your account" role="option" aria-selected={false} aria-disabled={true}>
          <span className="cx2-rank you">YOU</span>
          {you ? (
            <>
              <div className="cx2-chip-head">
                <Avatar src={you.avatar} name={you.handle} size={34} />
                <span className="cx2-chip-id"><b title={you.name}>{you.name.replace(/^@/, "")}</b><small>@{you.handle}</small></span>
              </div>
              <div className="cx2-chip-stats">
                <span><b>{you.audience.state === "ok" ? fmtN(you.audience.value) : "—"}</b><small>followers</small></span>
                <span>
                  <b className={you.engagement.state === "ok" ? "" : "none"}>{you.engagement.state === "ok" ? `${you.engagement.value!.toFixed(1)}%` : "—"}</b>
                  <small>{youRank != null ? `eng · #${youRank}` : "eng"}</small>
                </span>
              </div>
            </>
          ) : (
            <div className="cx2-chip-connect">
              <Link2 size={13} />
              <span>Not connected</span>
              <a href={connectHref} className="ov-link">Connect Instagram</a>
            </div>
          )}
        </article>

        {rows.map((r, i) => {
          const selected = r.id === selectedId;
          const rank = ranks[r.id];
          const gated = r.audience.state === "connection_needed";
          return (
            <article
              key={r.id}
              className={`cx2-chip-card cx2-rise${selected ? " selected" : ""}`}
              style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
              role="option" aria-selected={selected} tabIndex={0}
              onClick={() => onSelect(r.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(r.id); } }}
            >
              <span className="cx2-rank" title={rank != null ? "Rank by published engagement rate on this page" : classLabel(r.classification) ?? undefined}>
                {rank != null ? `#${rank}` : <PlatformMark p={r.platform} size={10} />}
              </span>
              {r.tracked && <i className="cx2-live-dot" title="Tracked" />}
              <div className="cx2-chip-head">
                <Avatar src={r.avatar} name={r.name} size={34} />
                <span className="cx2-chip-id">
                  <b title={r.name}>{r.name}</b>
                  <small title={`@${r.handle}`}><PlatformMark p={r.platform} size={9} /> @{r.handle}</small>
                </span>
              </div>
              <div className="cx2-chip-stats">
                <span>
                  <b className={r.audience.state === "ok" ? "" : "none"} title={gated ? "Needs a linked Facebook Page" : undefined}>{r.audience.state === "ok" ? fmtN(r.audience.value) : "—"}</b>
                  <small>{r.platform === "youtube" ? "subs" : "followers"}</small>
                </span>
                <span>
                  {r.match != null
                    ? <><b>{r.match}%</b><small>match</small></>
                    : r.engagement.state === "ok"
                      ? <><b>{r.engagement.value!.toFixed(1)}%</b><small>eng</small></>
                      : <><b className="none">—</b><small>added</small></>}
                </span>
              </div>
            </article>
          );
        })}
      </div>
      {canRight && <button type="button" className="cx-arrow right" onClick={() => step(1)} aria-label="Next competitors"><ChevronRight size={15} /></button>}
    </div>
  );
}
