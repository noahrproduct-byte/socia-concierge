"use client";

// Niche Trends: real posts from across the niche, ranked by relevance and by
// performance against each creator's own baseline; then the patterns those
// posts share, their direction over time, and one opportunity that several
// kinds of evidence support. Every claim carries its sample size.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUp, Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, Info, Play, RefreshCw, Sparkles, FileText, X } from "lucide-react";
import { askSocia } from "@/lib/ask";
import { momentum, pickOpportunity, rankNiche, workingNow, baselineText, type MomentumResult, type NichePost, type Opportunity, type WorkingResult } from "@/lib/nicheTrends";
import type { GroupedPatterns } from "@/lib/competitorIntel";
import type { OpportunityConcept } from "@/app/api/niche/opportunity/route";
import type { CompetitorsData } from "./types";
import { NicheRangeSelect, NicheSelect, RefreshButton } from "./Controls";
import { PlatformMark, fmtDate, fmtN } from "./shared";

function NicheCard({ p, saved, onOpen, onSave }: { p: NichePost; saved: boolean; onOpen: (p: NichePost) => void; onSave: (p: NichePost) => void }) {
  const base = baselineText(p);
  return (
    <article className="cx-ncard">
      <button type="button" className="cx-ncard-media" onClick={() => onOpen(p)} aria-label={`Analyse: ${p.title ?? "post"}`}>
        {p.thumb
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={p.thumb} alt="" loading="lazy" />
          : <span className="cx-ncard-ph"><PlatformMark p={p.platform} size={20} /></span>}
        <span className="cx-ncard-plat"><PlatformMark p={p.platform} size={11} /></span>
        {p.views != null && <span className="cx-ncard-views"><Play size={10} fill="currentColor" /> {fmtN(p.views)}</span>}
      </button>
      <button type="button" className={`cx-ncard-save${saved ? " on" : ""}`} onClick={() => onSave(p)} aria-label={saved ? "Remove from saved" : "Save"}>{saved ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}</button>
      <button type="button" className="cx-ncard-title" onClick={() => onOpen(p)} title={p.title ?? undefined}>{p.title ?? "(untitled)"}</button>
      <small className="cx-ncard-creator">{p.accountHandle ? `@${p.accountHandle.replace(/^@/, "")}` : p.accountName ?? "Unknown creator"}</small>
      <div className="cx-ncard-foot">
        {p.multiplier != null
          ? <span className="cx-ncard-mult" title={base ? `Performance vs creator baseline. Post: ${base.post}. Recent comparable-post median: ${base.median}. ${base.mult}.` : undefined}><ArrowUp size={10} /> {p.multiplier.toFixed(1)}× above average</span>
          : <span className="cx-ncard-mult muted" title="The creator's own median is not known, so no multiple is claimed.">Baseline not available</span>}
        <small>{fmtDate(p.publishedAt)}{p.format ? ` · ${p.format}` : ""}</small>
      </div>
    </article>
  );
}

function Carousel({ items, saved, onOpen, onSave }: { items: NichePost[]; saved: Set<string>; onOpen: (p: NichePost) => void; onSave: (p: NichePost) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const update = useCallback(() => { const el = ref.current; if (!el) return; setCanLeft(el.scrollLeft > 4); setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4); }, []);
  useEffect(() => { update(); const el = ref.current; if (!el) return; el.addEventListener("scroll", update, { passive: true }); const ro = new ResizeObserver(update); ro.observe(el); return () => { el.removeEventListener("scroll", update); ro.disconnect(); }; }, [update, items.length]);
  const step = (d: 1 | -1) => { const el = ref.current; if (!el) return; const c = el.querySelector<HTMLElement>(".cx-ncard"); el.scrollBy({ left: ((c?.offsetWidth ?? 160) + 12) * 3 * d, behavior: "smooth" }); };
  return (
    <div className="cx-carousel">
      {canLeft && <button type="button" className="cx-arrow left" onClick={() => step(-1)} aria-label="Previous posts"><ChevronLeft size={15} /></button>}
      <div className="cx-cscroll" ref={ref} tabIndex={0} role="region" aria-label="Top performing content in your niche" onKeyDown={(e) => { if (e.key === "ArrowRight") { e.preventDefault(); step(1); } if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); } }}>
        {items.map((p) => <NicheCard key={p.url} p={p} saved={saved.has(p.url)} onOpen={onOpen} onSave={onSave} />)}
      </div>
      {canRight && <button type="button" className="cx-arrow right" onClick={() => step(1)} aria-label="Next posts"><ChevronRight size={15} /></button>}
    </div>
  );
}

function Working({ w, onTag }: { w: WorkingResult; onTag: (t: string) => void }) {
  return (
    <section className="ov-card cx-working">
      <div className="ov-card-head"><h2>What&apos;s working right now <span className="cx-info" title={`Counted across the top ${w.topCount || 10} niche posts ranked by performance against each creator's own median. Lift: the median multiple of posts with the pattern ÷ the median of posts without it, over all ${w.baselineCount} posts with a baseline.`}><Info size={13} /></span></h2></div>
      {w.insufficient ? (
        <div className="cx-empty"><p>Not enough content yet to identify reliable niche patterns: {w.baselineCount} posts with a baseline, {w.minTop} needed. Widen the range or refresh discovery.</p></div>
      ) : w.rows.length ? (
        <ul className="cx-work-list">
          {w.rows.slice(0, 5).map((r) => (
            <li key={r.tag}>
              <button type="button" className="cx-work-thumb" onClick={() => onTag(r.tag)} aria-label={`Show posts with ${r.tag}`}>
                {r.example?.thumb
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={r.example.thumb} alt="" loading="lazy" />
                  : <span />}
              </button>
              <span className="cx-work-body"><b>{r.tag}</b><small>Seen in {r.seenIn} of {r.of} top posts</small></span>
              <span className="cx-work-lift">
                {r.lift != null
                  ? <><b className={r.lift >= 1.2 ? "" : "flat"}>{r.lift.toFixed(1)}×</b><small>{r.lift >= 1.2 ? "higher median performance" : r.lift >= 0.9 ? "median performance, about even" : "median performance, below the rest"}</small></>
                  : <small className="muted" title={`Needs at least three posts without the pattern to compare; ${r.withoutCount} available.`}>lift not measurable</small>}
              </span>
            </li>
          ))}
        </ul>
      ) : <div className="cx-empty"><p>No pattern repeats across the top {w.topCount} posts. That is a real answer, not a gap.</p></div>}
      {!w.insufficient && <small className="cx-sample"><Info size={11} /> Based on {w.baselineCount} niche posts with a creator baseline</small>}
    </section>
  );
}

function Trending({ m, dirn, onTag }: { m: MomentumResult; dirn: "up" | "down"; onTag: (t: string) => void }) {
  const rows = dirn === "up" ? m.up : m.down;
  const title = dirn === "up" ? "Trending Up" : "Trending Down";
  const Icon = dirn === "up" ? ArrowUp : ArrowDown;
  return (
    <section className={`ov-card cx-trend ${dirn}`}>
      <div className="ov-card-head"><h2><span className={`cx-trend-ico ${dirn}`}><Icon size={13} /></span> {title} <span className="cx-info" title={`Share of dated niche posts using a pattern in the last ${m.halfDays} days against the ${m.halfDays} days before. Status needs at least two posts on the relevant side. Based on ${m.recentCount} recent and ${m.earlierCount} earlier posts.`}><Info size={13} /></span></h2></div>
      {m.insufficient ? (
        <div className="cx-empty small"><p>Not enough dated niche content to measure direction: {m.recentCount} recent and {m.earlierCount} earlier posts, {m.minPerHalf} needed on each side.</p></div>
      ) : rows.length ? (
        <ul className="cx-trend-list">
          {rows.map((r) => (
            <li key={r.tag}>
              <button type="button" className="cx-trend-body" onClick={() => onTag(r.tag)}>
                <b>{r.tag}</b>
                <small>{r.recent} of {m.recentCount} recent posts vs. {r.earlier} of {m.earlierCount} before</small>
              </button>
              <span className={`cx-trend-stat ${dirn}`} title={`${r.deltaPts > 0 ? "+" : ""}${r.deltaPts} percentage points of share`}>{r.status}</span>
            </li>
          ))}
        </ul>
      ) : <div className="cx-empty small"><p>{dirn === "up" ? "No pattern is gaining share in the recent period." : "No pattern is losing share in the recent period."}</p></div>}
    </section>
  );
}

function OpportunityCard({ o, onExamples }: { o: Opportunity | null; onExamples: (t: string) => void }) {
  const [concept, setConcept] = useState<OpportunityConcept | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!o) return;
    let alive = true;
    setBusy(true); setErr(null); setConcept(null);
    fetch("/api/niche/opportunity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tag: o.tag, why: o.why.map((w) => w.text), example: o.example ? { title: o.example.title, accountName: o.example.accountName } : null, competitorName: o.competitorName }) })
      .then(async (r) => { const j = await r.json(); if (!alive) return; if (!r.ok) setErr(j.error ?? "SOCIA couldn't draft your version right now."); else setConcept(j); })
      .catch(() => alive && setErr("SOCIA couldn't draft your version right now."))
      .finally(() => alive && setBusy(false));
    return () => { alive = false; };
  }, [o?.tag]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!o) {
    return (
      <section className="ov-card cx-opp">
        <div className="ov-card-head"><h2><PlatformMark p="instagram" size={12} /> Opportunity for You</h2></div>
        <div className="cx-empty"><p>SOCIA surfaces an opportunity only when niche performance, trend direction, a competitor or your own results point the same way. Not enough combined evidence yet.</p></div>
      </section>
    );
  }
  const build = () => askSocia({
    question: `Build this post for my account: "${o.tag}". ${concept ? `Concept: ${concept.concept} Hook: "${concept.hook}". Shots: ${concept.shots.join("; ")}.` : ""} Evidence: ${o.why.map((w) => w.text).join(" ")} Give me the final hook, shot list, on-screen text, caption and call to action, and tell me when to post it.`,
    autoSend: true, context: { page: "competitors" }, contextLabel: `Opportunity: ${o.tag}`,
  });
  const note = `Opportunity: ${o.tag}. ${concept?.concept ?? ""} Why: ${o.why.map((w) => w.text).join(" ")}`;
  // The only thing pickOpportunity actually established: how many independent kinds of evidence agree.
  const sources = new Set(o.why.map((w) => w.source)).size;
  return (
    <section className="ov-card cx-opp">
      <div className="ov-card-head"><h2><span className="cx-opp-mark"><PlatformMark p={o.example?.platform ?? "instagram"} size={11} /></span> Opportunity for You</h2><span className="cx-chip potential" title="Independent evidence sources pointing the same way, listed below.">{sources} sources agree</span></div>
      <div className="cx-opp-body">
        {o.example?.thumb && (
          <button type="button" className="cx-opp-media" onClick={() => onExamples(o.tag)} aria-label="See examples">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={o.example.thumb} alt="" loading="lazy" />
          </button>
        )}
        <div className="cx-opp-copy">
          <h3>{o.tag}</h3>
          {busy && <div className="cx-nd-skel two"><span /><span /></div>}
          {concept && <p className="cx-opp-concept">{concept.concept}</p>}
          {!busy && err && <p className="cx-opp-err">{err}</p>}
          <small className="cx-opp-h">Why SOCIA surfaced it</small>
          <ul className="cx-opp-why">{o.why.map((w) => <li key={w.text}><i className={w.source} /> {w.text}</li>)}</ul>
          {concept?.hook && <p className="cx-opp-hook"><b>Opening line:</b> {concept.hook}</p>}
        </div>
      </div>
      <div className="cx-opp-actions">
        <button type="button" className="ov-btn primary" onClick={build}><Sparkles size={13} /> Build this post <ArrowRight size={13} /></button>
        <Link href={`/tool?note=${encodeURIComponent(note)}`} className="ov-btn ghost"><FileText size={13} /> Add to Content Plan</Link>
        <button type="button" className="ov-btn ghost" onClick={() => onExamples(o.tag)}>See examples</button>
      </div>
    </section>
  );
}

export default function NicheSection({ d, active, saved, savedItems, saving, saveError, onOpen, onSave }: {
  d: CompetitorsData; active: { name: string; patterns: GroupedPatterns } | null;
  saved: Set<string>; savedItems: NichePost[]; saving: string | null;
  /** Why the last save or unsave failed, from the server. */
  saveError?: string | null;
  onOpen: (p: NichePost) => void; onSave: (p: NichePost) => void;
}) {
  const now = useMemo(() => new Date(d.now), [d.now]);
  const [tag, setTag] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const [all, setAll] = useState(false);
  const topRef = useRef<HTMLHeadingElement>(null);

  const ranged = useMemo(() => rankNiche(d.content, { now, days: d.nicheRange || null }), [d.content, now, d.nicheRange]);
  const shown = useMemo(() => {
    const base = showSaved ? rankNiche(savedItems, { now, days: null }) : ranged;
    return tag ? base.filter((p) => p.tags.includes(tag)) : base;
  }, [ranged, savedItems, showSaved, tag, now]);
  const working = useMemo(() => workingNow(ranged), [ranged]);
  const mom = useMemo(() => momentum(d.content, { now, windowDays: 90 }), [d.content, now]);
  const opp = useMemo(() => pickOpportunity({
    working, momentum: mom,
    competitor: active && !active.patterns.insufficient ? { name: active.name, rows: [...active.patterns.themes, ...active.patterns.hooks].map((p) => ({ tag: p.tag, count: p.count, total: p.total })) } : null,
    own: d.own, goalKeywords: d.goalKeywords,
  }), [working, mom, active, d.own, d.goalKeywords]);

  const focusTag = (t: string) => { setTag(t); setShowSaved(false); setAll(true); topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const rangeLabel = d.nicheRange === 0 ? "all posts found" : `last ${d.nicheRange} days`;
  const webPaused = d.sources && d.sources.web !== "ok";

  return (
    <section className="cx-niche" id="trends">
      <div className="cx-niche-head">
        <div>
          <h2>Niche Trends</h2>
          <p>Real content from across your niche. See what&apos;s working right now and get inspired for your next post.</p>
        </div>
        <div className="cx-niche-controls">
          <NicheSelect niche={d.niche} />
          <NicheRangeSelect value={d.nicheRange} />
          <button type="button" className="ov-link" onClick={() => setAll((v) => !v)}>{all ? "Show carousel" : "View all"} <ArrowRight size={13} /></button>
        </div>
      </div>

      {!d.niche ? (
        <div className="ov-empty cx-niche-empty"><b>Choose your niche first</b><p>SOCIA searches for competitors and winning content inside your niche. Pick it above and refresh.</p></div>
      ) : (
        <>
          <div className="cx-niche-sub" ref={topRef as React.RefObject<HTMLDivElement>}>
            <h3>Top Performing Content in Your Niche <span className="cx-info" title="Ranked by relevance to your niche, market, format and goal, then by performance against each creator's own median. Raw view counts never decide the order."><Info size={13} /></span></h3>
            <div className="cx-niche-chips">
              <button type="button" className={`ov-chip${!showSaved && !tag ? " primary" : " muted"}`} onClick={() => { setShowSaved(false); setTag(null); }}>All · {ranged.length}</button>
              <button type="button" className={`ov-chip${showSaved ? " primary" : " muted"}`} onClick={() => { setShowSaved(true); setTag(null); }}>Saved · {savedItems.length}</button>
              {tag && <button type="button" className="ov-chip primary" onClick={() => setTag(null)}>{tag} <X size={10} /></button>}
              <small>{showSaved ? "your saved posts" : rangeLabel}</small>
            </div>
          </div>
          {saveError && <p className="cx-add-err" role="alert">{saveError}</p>}
          {shown.length ? (
            all ? (
              <div className="cx-ngrid">{shown.slice(0, 40).map((p) => <NicheCard key={p.url} p={p} saved={saved.has(p.url)} onOpen={onOpen} onSave={onSave} />)}</div>
            ) : <Carousel items={shown.slice(0, 20)} saved={saved} onOpen={onOpen} onSave={onSave} />
          ) : (
            <div className="ov-empty cx-niche-empty">
              <b>{showSaved ? "Nothing saved yet" : tag ? `No posts with "${tag}" in this range` : d.content.length ? `No dated niche posts in the ${rangeLabel}` : "No niche content yet"}</b>
              <p>{showSaved ? "Save a post from its analysis drawer and it stays here after discovery moves on." : tag ? "Clear the filter or widen the range." : d.content.length ? "Widen the range, or refresh to search again." : webPaused ? `Web research is paused (${d.sources?.web}). YouTube discovery still runs on refresh.` : "Run a discovery refresh to search your niche."}</p>
              {!showSaved && !tag && <RefreshButton className="ov-btn ghost small" label="Refresh discovery" />}
            </div>
          )}
          {/* Before any discovery, all four cards would only apologize in four
              different ways — the empty state above already says it once. */}
          {d.content.length > 0 && (
            <div className="cx-row cx-row-bottom">
              <Working w={working} onTag={focusTag} />
              <Trending m={mom} dirn="up" onTag={focusTag} />
              <Trending m={mom} dirn="down" onTag={focusTag} />
              <OpportunityCard o={opp} onExamples={focusTag} />
            </div>
          )}
          <p className="cx-niche-foot"><RefreshCw size={11} /> {d.lastRun ? `Discovery last ran ${fmtDate(d.lastRun)}` : "No discovery run yet"}{webPaused ? ` · web research ${d.sources?.web === "no_credit" ? "paused (AI credit)" : d.sources?.web === "rate_limited" ? "rate limited" : "unavailable"}` : ""}{d.sources?.youtube === "not_configured" ? " · YouTube not configured" : ""}. {busyNote(d)}</p>
        </>
      )}
    </section>
  );
}

function busyNote(d: CompetitorsData): string {
  const dated = d.content.filter((p) => p.publishedAt).length;
  return `${d.content.length} posts stored, ${dated} with dates, ${d.content.filter((p) => p.multiplier != null).length} with a creator baseline.`;
}
