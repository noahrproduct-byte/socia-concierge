"use client";

// The competitor roster: the user's own card first, then the accounts SOCIA
// compares, with the next card peeking in from the right. Native overflow
// scrolling (trackpad), arrows, and arrow-key navigation; never autoplays.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Link2 } from "lucide-react";
import type { LeaderRow } from "@/lib/competitorRollup";
import type { CompetitorRow } from "@/lib/competitorIntel";
import { Avatar, PlatformMark, classLabel, fmtN } from "./shared";

export default function Roster({ you, rows, selectedId, onSelect, connectHref }: {
  you: LeaderRow | null; rows: CompetitorRow[]; selectedId: string | null; onSelect: (id: string) => void; connectHref: string;
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
    const card = el.querySelector<HTMLElement>(".cx-rcard");
    el.scrollBy({ left: ((card?.offsetWidth ?? 236) + 12) * 2 * dirn, behavior: "smooth" });
  };
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const cards = [...(ref.current?.querySelectorAll<HTMLElement>(".cx-rcard[tabindex]") ?? [])];
    const i = cards.indexOf(document.activeElement as HTMLElement);
    const next = cards[i + (e.key === "ArrowRight" ? 1 : -1)];
    if (next) { e.preventDefault(); next.focus(); next.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" }); }
  };

  return (
    <div className="cx-roster">
      {canLeft && <button type="button" className="cx-arrow left" onClick={() => step(-1)} aria-label="Previous competitors"><ChevronLeft size={15} /></button>}
      <div className="cx-rscroll" ref={ref} role="listbox" aria-label="Competitors" onKeyDown={onKey}>
        <article className="cx-rcard you" aria-label="Your account">
          <span className="cx-rlabel">Your Account</span>
          {you ? (
            <>
              <div className="cx-rhead">
                <Avatar src={you.avatar} name={you.handle} size={44} />
                <span className="cx-rid"><b title={you.name}>{you.name.replace(/^@/, "")}</b><small>@{you.handle}</small></span>
              </div>
              <div className="cx-rfoot">
                <b>{you.audience.state === "ok" ? fmtN(you.audience.value) : "—"}</b> <small>followers</small>
              </div>
            </>
          ) : (
            <div className="cx-rconnect">
              <Link2 size={13} /> <span>Not connected</span>
              <Link href={connectHref} className="ov-link">Connect Instagram</Link>
            </div>
          )}
        </article>

        {rows.map((r) => {
          const selected = r.id === selectedId;
          const gated = r.audience.state === "connection_needed";
          return (
            <article
              key={r.id}
              className={`cx-rcard${selected ? " selected" : ""}`}
              role="option" aria-selected={selected} tabIndex={0}
              onClick={() => onSelect(r.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(r.id); } }}
            >
              <div className="cx-rhead">
                <Avatar src={r.avatar} name={r.name} size={44} />
                <span className="cx-rid">
                  <b title={r.name}>{r.name}</b>
                  <small title={`@${r.handle}`}><PlatformMark p={r.platform} size={10} /> @{r.handle}</small>
                </span>
              </div>
              <div className="cx-rchips">
                {r.classification && <span className={`cx-chip ${r.classification}`}>{classLabel(r.classification)}</span>}
                {r.tracked && <span className="cx-chip tracked">Tracked</span>}
              </div>
              <div className="cx-rmatch">{r.match != null ? <><b>{r.match}%</b> match</> : <span className="muted">Added by you</span>}</div>
              <div className="cx-rfoot">
                {r.audience.state === "ok"
                  ? <><b>{fmtN(r.audience.value)}</b> <small>{r.platform === "youtube" ? "subscribers" : "followers"}</small></>
                  : <small className="muted" title={gated ? "Needs a linked Facebook Page" : "Not published by the platform"}>{gated ? "Connection required" : "Followers not published"}</small>}
              </div>
            </article>
          );
        })}
      </div>
      {canRight && <button type="button" className="cx-arrow right" onClick={() => step(1)} aria-label="Next competitors"><ChevronRight size={15} /></button>}
    </div>
  );
}
