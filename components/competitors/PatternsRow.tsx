"use client";

// Content intelligence for the selected competitor, drawn not written:
// their format mix as a donut, their posting rhythm as a heatmap, and their
// strongest real posts as cards. Every mark is a count over the posts SOCIA
// actually read; the sample size stays on screen.

import Link from "next/link";
import { Clock, Info, Link2, PieChart } from "lucide-react";
import type { CompetitorRow, GroupedPatterns } from "@/lib/competitorIntel";
import { Donut, Heatmap, postingGrid } from "./viz";
import { fmtDate, fmtN } from "./shared";

export function gateText(r: CompetitorRow): string {
  switch (r.postsGate) {
    case "connection_needed": return "Their posts need a linked Facebook Page to read; Instagram shares them only through Business Discovery.";
    case "not_business": return `Instagram only publishes posts for public Business and Creator accounts; ${r.name} is personal or private.`;
    case "not_found": return `The platform returned no account for @${r.handle}.`;
    case "no_permission": return "Reconnect Facebook to grant Instagram access (instagram_basic).";
    case "failed": return "Data source unavailable right now, try again later.";
    default: return r.platform === "facebook" ? "Facebook publishes nothing about Pages you don't manage." : "No posts read for this account yet.";
  }
}

function Gate({ r, height = 150 }: { r: CompetitorRow; height?: number }) {
  return (
    <div className="cx2-locked" style={{ minHeight: height }}>
      <div className="cx2-locked-ghost" aria-hidden />
      <div className="cx2-locked-cta">
        <Link2 size={13} />
        <p>{gateText(r)}</p>
        {r.postsGate === "connection_needed" && <a href="/api/auth/facebook/start" className="ov-btn primary small">Connect Facebook</a>}
      </div>
    </div>
  );
}

function Insufficient({ r, patterns }: { r: CompetitorRow; patterns: GroupedPatterns | null }) {
  return <p className="cx-empty small">Not enough posts to call a pattern: {r.posts.length} read, {patterns?.minSample ?? 5} needed.</p>;
}

/** One unlock banner for the whole content-intelligence row, shown instead of
 *  two cards carrying the identical Connect Facebook message. */
export function ContentUnlock({ r }: { r: CompetitorRow }) {
  return (
    <section className="ov-card cx2-card cx2-unlock">
      <div className="cx2-locked-ghost" aria-hidden />
      <div className="cx2-unlock-body">
        <span className="cx2-unlock-ico"><Link2 size={16} /></span>
        <div className="cx2-unlock-copy">
          <b>Unlock {r.name}&apos;s content intelligence</b>
          <p>{gateText(r)} One connection unlocks their format mix, posting rhythm and top posts.</p>
        </div>
        {r.postsGate === "connection_needed" && <a href="/api/auth/facebook/start" className="ov-btn primary small">Connect Facebook</a>}
      </div>
      <div className="cx2-unlock-feats" aria-hidden>
        <span><PieChart size={12} /> Format mix</span>
        <span><Clock size={12} /> When they post</span>
        <span>★ Top content</span>
      </div>
    </section>
  );
}

/* ---------- what's working for them (format mix) ---------- */

export function ContentMix({ r, patterns, yourTopFormat }: { r: CompetitorRow | null; patterns: GroupedPatterns | null; yourTopFormat: string | null }) {
  const ok = r && patterns && !patterns.insufficient;
  const slices = ok ? patterns.format.slice(0, 4).map((f) => ({ label: f.tag, share: f.share, count: f.count })) : [];
  const top = ok ? patterns.format[0] : null;
  const topTheme = ok ? patterns.themes[0] : null;
  const topHook = ok ? patterns.hooks[0] : null;
  return (
    <section className="ov-card cx2-card cx2-mix">
      <div className="cx2-card-head"><h2><PieChart size={14} /> What&apos;s working for them</h2>{ok && <span className="cx2-micro">LAST {patterns.total} POSTS</span>}</div>
      {!r ? <p className="cx-empty small">Select a competitor.</p>
        : !ok ? (r.posts.length === 0 ? <Gate r={r} /> : <Insufficient r={r} patterns={patterns} />)
        : slices.length === 0 ? <p className="cx-empty small">The platform did not report a format for these posts.</p>
        : (
          <div className="cx2-mix-body">
            <Donut slices={slices} />
            <div className="cx2-mix-legend">
              {slices.map((s, i) => (
                <div key={s.label} className="cx2-legend-row">
                  <i className={`cx2-swatch s${i}`} /> <span>{s.label}</span> <b>{s.share}%</b>
                </div>
              ))}
              {top && (
                <div className="cx2-mix-verdict">
                  {yourTopFormat && top.tag !== yourTopFormat
                    ? <>They lead with <b>{top.tag.toLowerCase()}</b>{top.medianMultiplier != null && top.medianMultiplier >= 1.1 ? <> at a median <b>{top.medianMultiplier.toFixed(1)}×</b> their baseline</> : null}; you post mostly {yourTopFormat.toLowerCase()}.</>
                    : <><b>{top.count}</b> of their last {top.total} posts are {top.tag.toLowerCase()}{top.medianMultiplier != null && top.medianMultiplier >= 1.1 ? <>, at a median <b>{top.medianMultiplier.toFixed(1)}×</b> their own baseline</> : null}.</>}
                </div>
              )}
            </div>
          </div>
        )}
      {ok && (topTheme || topHook) && (
        <div className="cx2-mix-tags">
          {topTheme && <span className="cx2-tagchip" title={`${topTheme.count} of ${topTheme.total} posts`}>{topTheme.tag} · {topTheme.share}%</span>}
          {topHook && <span className="cx2-tagchip" title={`${topHook.count} of ${topHook.total} titles`}>{topHook.tag} · {topHook.share}%</span>}
        </div>
      )}
    </section>
  );
}

/* ---------- when they post (heatmap) ---------- */

export function WhenTheyPost({ r }: { r: CompetitorRow | null }) {
  const times = (r?.posts ?? []).map((p) => (p.publishedAt ? new Date(p.publishedAt) : null)).filter((d): d is Date => Boolean(d && !Number.isNaN(d.getTime())));
  const enough = times.length >= 5;
  let insight: string | null = null;
  if (enough) {
    const { grid, total } = postingGrid(times);
    const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const SLOT = ["mornings", "afternoons", "evenings", "nights"];
    let bs = 0, bd = 0, bv = -1;
    grid.forEach((row, si) => row.forEach((v, di) => { if (v > bv) { bv = v; bs = si; bd = di; } }));
    if (bv > 0) insight = `Most active: ${DAY[bd]} ${SLOT[bs]} (UTC), ${bv} of their last ${total} posts.`;
  }
  return (
    <section className="ov-card cx2-card cx2-when">
      <div className="cx2-card-head"><h2><Clock size={14} /> When they post</h2>{enough && <span className="cx2-micro">{times.length} DATED POSTS</span>}</div>
      {!r ? <p className="cx-empty small">Select a competitor.</p>
        : !enough ? (r.posts.length === 0 ? <Gate r={r} /> : <p className="cx-empty small">Needs at least 5 dated posts; {times.length} read.</p>)
        : (
          <>
            <Heatmap times={times} />
            {insight && <p className="cx2-heat-insight">{insight}</p>}
            <small className="cx2-foot"><Info size={11} /> Posting frequency, counted from timestamps, times in UTC. Platforms don&apos;t publish when a competitor&apos;s engagement peaks.</small>
          </>
        )}
    </section>
  );
}

/* ---------- top content ---------- */

export function TopContent({ r, onExamples }: { r: CompetitorRow | null; onExamples: (tag: string | null, title: string) => void }) {
  if (!r || r.posts.length === 0) return null;
  const scored = r.posts.filter((p) => (p.views ?? p.likes) != null);
  const top = [...scored].sort((a, b) => ((b.views ?? b.likes) ?? 0) - ((a.views ?? a.likes) ?? 0)).slice(0, 3);
  if (!top.length) return null;
  return (
    <section className="ov-card cx2-card cx2-top">
      <div className="cx2-card-head">
        <h2>Their top content</h2>
        <button type="button" className="ov-link" onClick={() => onExamples(null, `Top posts from ${r.name}`)}>All posts →</button>
      </div>
      <div className="cx2-top-grid">
        {top.map((p, i) => (
          <a key={p.url} href={p.url} target="_blank" rel="noreferrer" className="cx2-top-card cx2-rise" style={{ animationDelay: `${i * 90}ms` }}>
            <span className="cx2-top-thumb">
              {p.thumb
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={p.thumb} alt="" loading="lazy" />
                : <i className="ph" aria-hidden />}
              {p.format && <em>{p.format.toUpperCase()}</em>}
              {p.multiplier != null && p.multiplier >= 1.5 && <b className="cx2-mult">{p.multiplier.toFixed(1)}×</b>}
            </span>
            <b className="cx2-top-title">{p.title ?? "Untitled post"}</b>
            <span className="cx2-top-stats">
              {p.views != null && <span>{fmtN(p.views)} views</span>}
              {p.likes != null && <span>{fmtN(p.likes)} likes</span>}
              {p.comments != null && <span>{fmtN(p.comments)} comments</span>}
              {p.publishedAt && <span className="muted">{fmtDate(p.publishedAt)}</span>}
            </span>
          </a>
        ))}
      </div>
      {r.posts.some((p) => p.multiplier != null) && <small className="cx2-foot">× is each post against the account&apos;s own median views: their baseline, not yours.</small>}
    </section>
  );
}
