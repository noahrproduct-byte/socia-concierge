"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Play, ArrowRight } from "lucide-react";

// Interactive competitor rail + outlier grid (preview dataset).
// Selecting a competitor highlights their outlier post below.

export type Tracked = {
  handle: string;
  followers: string;
  eng: string;
  momentum: number;
  spark: number[];
  avatar?: string | null;
};

export type Outlier = {
  handle: string;
  format: string;
  mult: string;
  why: string;
  views: string;
  saves: string;
  img: string;
  tone: "amber" | "blue" | "green" | "purple";
};

function MiniSpark({ data }: { data: number[] }) {
  const W = 64;
  const H = 18;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * W},${H - 2 - ((v - min) / span) * (H - 4)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="cp2-spark" aria-hidden preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export default function CompetitorsBoard({
  tracked,
  outliers,
}: {
  tracked: Tracked[];
  outliers: Outlier[];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const railRef = useRef<HTMLDivElement>(null);

  function scrollRail(dir: 1 | -1) {
    railRef.current?.scrollBy({ left: dir * 260, behavior: "smooth" });
  }
  function pick(handle: string) {
    setSelected((s) => (s === handle ? null : handle));
  }

  const selCount = selected ? outliers.filter((o) => o.handle === selected).length : null;

  return (
    <>
      {/* competitor rail */}
      <div className="cp2-railwrap">
        <button className="cp2-railbtn l" onClick={() => scrollRail(-1)} aria-label="Scroll competitors left">
          <ChevronLeft size={16} />
        </button>
        <div className="cp2-rail" ref={railRef} role="listbox" aria-label="Tracked competitors">
          {tracked.map((c) => (
            <button
              key={c.handle}
              className={`cp2-acct ${selected === c.handle ? "on" : ""}`}
              onClick={() => pick(c.handle)}
              role="option"
              aria-selected={selected === c.handle}
            >
              {c.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="cp2-avatar" src={c.avatar} alt="" width={38} height={38} />
              ) : (
                <span className="cp2-avatar ph">{c.handle.replace("@", "")[0].toUpperCase()}</span>
              )}
              <span className="cp2-acct-meta">
                <b>{c.handle}</b>
                <small>{c.followers} followers</small>
                <small className="cp2-eng">
                  Eng. {c.eng} <em className="cp2-mom">▲ {c.momentum}</em>
                </small>
              </span>
              <MiniSpark data={c.spark} />
            </button>
          ))}
        </div>
        <button className="cp2-railbtn r" onClick={() => scrollRail(1)} aria-label="Scroll competitors right">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* outliers */}
      <section className="chart-card cp2-outcard">
        <div className="chart-head">
          <h3>Outliers this week</h3>
          <span className="head-note">
            {selected && selCount != null
              ? `${selCount} from ${selected} · tap the account again to clear`
              : "Posts doing 2×+ their account's median"}
          </span>
        </div>
        <div className="cp2-outgrid">
          {outliers.map((o) => (
            <article
              key={o.handle + o.mult}
              className={`cp2-out ${selected ? (selected === o.handle ? "hi" : "dim") : ""}`}
            >
              <div className="cp2-out-media">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={o.img} alt="" loading="lazy" />
                <span className={`cp2-mult ${o.tone}`}>{o.mult} median</span>
                <span className="cp2-play" aria-hidden>
                  <Play size={15} fill="currentColor" />
                </span>
              </div>
              <div className="cp2-out-body">
                <div className="cp2-out-top">
                  <b>{o.handle}</b>
                  <span className="cp2-fmt">{o.format}</span>
                </div>
                <p className="cp2-why">
                  <span>Why it won:</span> {o.why}
                </p>
                <div className="cp2-out-metrics">
                  <span><b>{o.views}</b> views</span>
                  <span><b>{o.saves}</b> saves</span>
                </div>
              </div>
            </article>
          ))}
        </div>
        <Link href="/niche" className="cp2-viewall">
          View all outliers <ArrowRight size={13} />
        </Link>
      </section>
    </>
  );
}
