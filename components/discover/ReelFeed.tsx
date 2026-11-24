"use client";

// Discover's Reels as two feeds (lib/discoverFeed.ts, Noah 2026-11-24): "Recommended for you", every relevant
// Reel in one ranked grid with a small badge for where it comes from, and "Trending", viral Reels from any
// industry with "Adapt to my business". Browsing costs nothing; an adaptation is written only when asked
// (app/api/discover/adapt) and opens in a side panel, so the page and its scroll position stay put.
import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Clapperboard, Copy, ExternalLink, Lock, Plus, RefreshCw, Shuffle, ThumbsUp, TrendingUp } from "lucide-react";
import { Button, Drawer, Skeleton } from "@/components/system";
import PlanNotice from "@/components/PlanNotice";
import { isPlanError, type PlanError } from "@/lib/planErrors";
import { FEED_BADGE, FEED_PAGE, type FeedReel } from "@/lib/discoverFeed";
import { ADAPTATIONS_PER_REEL, adaptationText, type Adaptation } from "@/lib/discoverAdapt";
import { reelKey } from "@/lib/discoverStyle";
import { handFiles } from "@/lib/studioClips/handoff";
import { PLATFORM, ago, brief, makeLikeReel, metricLine } from "@/components/competitors/TrendingNiche";
import "./reel-feed.css";

type Props = {
  recommended: FeedReel[];
  trending: FeedReel[];
  trendingNext: number | null;
  /** Reels with a saved adaptation for the current business profile (their keys). */
  adapted: string[];
  now: string;
  nicheAccess: boolean;
  nicheUpgrade: string | null;
  /** Why Recommended can be empty. */
  emptyWhy: string;
};

const keyOf = (r: FeedReel) => reelKey(r.url) ?? r.url;
const multLabel = (m: number) => `${m >= 10 ? m.toFixed(0) : m.toFixed(1)}× their usual`;

async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

function ReelCard({ r, now, badge, children }: { r: FeedReel; now: Date; badge: string | null; children: React.ReactNode }) {
  const meta = [metricLine(r), ago(r.publishedAt, now)].filter(Boolean).join(" | ");
  return (
    <article className="rf-card">
      <a href={r.url} target="_blank" rel="noopener noreferrer" className="rf-thumb" aria-label={`Open the ${r.format} by ${r.accountName} on ${PLATFORM[r.platform] ?? r.platform}`}>
        {r.thumb
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={r.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" />
          : <span className="rf-noimg">{r.format}</span>}
        {badge && <span className="rf-badge">{badge}</span>}
        {r.multiplier != null && <b className="rf-mult">{multLabel(r.multiplier)}</b>}
        <ExternalLink size={13} className="rf-open" aria-hidden />
      </a>
      <div className="rf-body">
        <span className="rf-acct">{r.accountHandle ? `@${r.accountHandle.replace(/^@/, "")}` : r.accountName}</span>
        {(r.line ?? r.title) && <p className="rf-line">{r.line ? `“${r.line}”` : r.title}</p>}
        {meta && <small className="rf-meta">{meta}</small>}
        <div className="rf-actions">{children}</div>
      </div>
    </article>
  );
}

function SkeletonCards({ n }: { n: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="rf-card rf-skel" aria-hidden>
          <Skeleton variant="block" className="rf-skel-thumb" />
          <div className="rf-body"><Skeleton variant="meta" width="50%" /><Skeleton width="90%" /><Skeleton width="70%" /></div>
        </div>
      ))}
    </>
  );
}

export default function ReelFeed({ recommended, trending: firstTrending, trendingNext, adapted, now: nowIso, nicheAccess, nicheUpgrade, emptyWhy }: Props) {
  const router = useRouter();
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [shown, setShown] = useState(FEED_PAGE);
  const [trending, setTrending] = useState(firstTrending);
  const [next, setNext] = useState(trendingNext);
  const [loading, setLoading] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  // The panel: which Reel, the adaptations written for it, which one is shown.
  const [open, setOpen] = useState<FeedReel | null>(null);
  const [versions, setVersions] = useState<Record<string, Adaptation[]>>({});
  const [pick, setPick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; plan?: PlanError } | null>(null);
  const [hasSaved] = useState(() => new Set(adapted));
  const asking = useRef(false);

  const skip = useMemo(() => recommended.map(keyOf).filter((k) => /^[A-Za-z0-9_-]{4,40}$/.test(k)).slice(0, 120).join(","), [recommended]);

  const loadMore = useCallback(async () => {
    if (next == null || loading) return;
    setLoading(true); setMoreError(null);
    try {
      const res = await fetch(`/api/discover/trending?offset=${next}&skip=${encodeURIComponent(skip)}`);
      const j = (await res.json().catch(() => ({}))) as { reels?: FeedReel[]; next?: number | null; error?: string };
      if (!res.ok) { setMoreError(j.error ?? "SOCIA couldn't load more Reels. Try again."); return; }
      setTrending((t) => { const have = new Set(t.map((r) => r.url)); return [...t, ...(j.reels ?? []).filter((r) => !have.has(r.url))]; });
      setNext(j.next ?? null);
    } catch {
      setMoreError("Couldn't reach SOCIA. Try again.");
    } finally { setLoading(false); }
  }, [next, loading, skip]);

  const copyBrief = async (id: string, text: string) => {
    if (await copyText(text)) { setCopied(id); setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000); }
    else window.prompt("Copy this brief", text);
  };

  /** Ask for adaptations: the saved ones first (free); a new one only when there are none, or when `again`. */
  const adapt = useCallback(async (r: FeedReel, again: boolean) => {
    if (asking.current) return;
    asking.current = true; setBusy(true); setError(null);
    const k = keyOf(r);
    try {
      const have = versions[k]?.length ?? 0;
      let list: Adaptation[] | null = null;
      if (!again && !have && hasSaved.has(k)) {
        const res = await fetch(`/api/discover/adapt?url=${encodeURIComponent(r.url)}`);
        const j = (await res.json().catch(() => ({}))) as { adaptations?: Adaptation[] };
        if (res.ok && j.adaptations?.length) list = j.adaptations;
      }
      if (!list) {
        const res = await fetch("/api/discover/adapt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reel: r, again, have }) });
        const j = (await res.json().catch(() => ({}))) as { adaptations?: Adaptation[]; error?: string };
        if (!res.ok || !j.adaptations?.length) { setError(isPlanError(j) ? { text: j.error ?? "", plan: j } : { text: j.error ?? "SOCIA couldn't write the adaptation. Try again; nothing was used." }); return; }
        list = j.adaptations;
      }
      setVersions((v) => ({ ...v, [k]: list! }));
      hasSaved.add(k);
      setPick(list.length - 1);
    } catch {
      setError({ text: "Couldn't reach SOCIA. Try again; nothing was used." });
    } finally { asking.current = false; setBusy(false); }
  }, [versions, hasSaved]);

  const openPanel = (r: FeedReel) => {
    setOpen(r); setError(null);
    const k = keyOf(r);
    setPick(Math.max(0, (versions[k]?.length ?? 1) - 1));
    if (!versions[k]?.length) void adapt(r, false);
  };

  const make = (r: FeedReel, a: Adaptation) => {
    const reference = r.refToken && r.video ? { url: `/api/studio/reference/media?url=${encodeURIComponent(r.video)}&token=${r.refToken}`, name: `${r.accountHandle ? `@${r.accountHandle}` : r.accountName} ${r.format}.mp4` } : undefined;
    handFiles("edit", [], { prompt: `${adaptationText(a, r)}\n\nCut it from my clips with the pacing and length above.`, ...(reference ? { reference } : {}) });
    router.push("/studio?mode=edit");
  };

  if (!nicheAccess) {
    return (
      <section className="ov-card cx2-card rf" aria-labelledby="rf-rec">
        <div className="cx2-card-head"><h2 id="rf-rec"><Lock size={14} aria-hidden /> Recommended for you</h2></div>
        <p className="rf-empty">Reels to copy and adapt are on {nicheUpgrade ? `the ${nicheUpgrade[0].toUpperCase()}${nicheUpgrade.slice(1)} plan` : "a paid plan"}. <Link href={`/pricing${nicheUpgrade ? `?plan=${nicheUpgrade}` : ""}`}>See plans</Link></p>
      </section>
    );
  }

  const rec = recommended.slice(0, shown);
  const panelKey = open ? keyOf(open) : null;
  const list = panelKey ? versions[panelKey] ?? [] : [];
  const a = list[Math.min(pick, list.length - 1)] ?? null;

  return (
    <>
      <section className="ov-card cx2-card rf" aria-labelledby="rf-rec">
        <div className="cx2-card-head">
          <h2 id="rf-rec"><ThumbsUp size={14} aria-hidden /> Recommended for you</h2>
          {recommended.length > 0 && <span className="cx2-micro">{recommended.length} Reels</span>}
        </div>
        {recommended.length === 0 ? <p className="rf-empty">{emptyWhy}</p> : (
          <>
            <div className="rf-grid">
              {rec.map((r) => (
                <ReelCard key={r.url} r={r} now={now} badge={FEED_BADGE[r.source]}>
                  <Button size="sm" variant="primary" onClick={() => makeLikeReel(r, (href) => router.push(href))} title="Opens the video editor with a brief written from this Reel; you add your clips.">
                    <Clapperboard size={13} aria-hidden /> Make a video like this
                  </Button>
                  <span className="rf-row">
                    <Link href={`/plan?idea=${encodeURIComponent(`${r.format} like @${(r.accountHandle ?? r.accountName).replace(/^@/, "")}'s: ${r.line ?? r.title ?? "same format and hook, my own subject"}`.slice(0, 280))}`} className="ov-btn outline small"><Plus size={13} aria-hidden /> Add to my plan</Link>
                    <button type="button" className="ov-btn ghost small" onClick={() => copyBrief(r.url, brief(r))}>
                      {copied === r.url ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />} {copied === r.url ? "Copied" : "Copy brief"}
                    </button>
                  </span>
                </ReelCard>
              ))}
            </div>
            {shown < recommended.length && (
              <button type="button" className="ov-btn ghost small rf-more" onClick={() => setShown((n) => n + FEED_PAGE)}>Load more Reels</button>
            )}
          </>
        )}
      </section>

      <section className="ov-card cx2-card rf" aria-labelledby="rf-trend">
        <div className="cx2-card-head">
          <h2 id="rf-trend"><TrendingUp size={14} aria-hidden /> Trending Reels</h2>
        </div>
        <p className="rf-lead">Viral Reels from any industry. Adapt the idea to your business.</p>
        {trending.length === 0 ? <p className="rf-empty">No trending Reels right now. SOCIA adds them as it reads more accounts.</p> : (
          <div className="rf-grid">
            {trending.map((r) => {
              const saved = Boolean(versions[keyOf(r)]?.length) || hasSaved.has(keyOf(r));
              return (
                <ReelCard key={r.url} r={r} now={now} badge={null}>
                  <Button size="sm" variant="primary" onClick={() => openPanel(r)}>
                    <Shuffle size={13} aria-hidden /> {saved ? "See my adaptation" : "Adapt to my business"}
                  </Button>
                </ReelCard>
              );
            })}
            {loading && <SkeletonCards n={4} />}
          </div>
        )}
        {moreError && <p className="rf-error" role="alert">{moreError}</p>}
        {next != null && !loading && <button type="button" className="ov-btn ghost small rf-more" onClick={loadMore}>Load more Reels</button>}
        <small className="cx2-foot">Numbers are what Instagram published for each Reel, against that account&apos;s own usual: other accounts&apos; results, not a forecast for yours.</small>
      </section>

      <Drawer open={open != null} onOpenChange={(o) => { if (!o) setOpen(null); }} title="Adapt to my business" width={560}>
        {open && (
          <div className="rf-panel">
            <a href={open.url} target="_blank" rel="noopener noreferrer" className="rf-orig">
              {open.thumb
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={open.thumb} alt="" referrerPolicy="no-referrer" />
                : <span className="rf-noimg">{open.format}</span>}
              <span>
                <b>{open.accountHandle ? `@${open.accountHandle.replace(/^@/, "")}` : open.accountName}</b>
                {(open.line ?? open.title) && <span className="rf-line">{open.line ?? open.title}</span>}
                <small>{[metricLine(open), open.multiplier != null ? multLabel(open.multiplier) : null].filter(Boolean).join(" | ")}</small>
              </span>
            </a>
            <p className="rf-note">SOCIA read this Reel&apos;s caption, numbers and cover, not the video itself.</p>

            {busy && !a && <div className="rf-writing" role="status"><Skeleton variant="title" width="80%" /><Skeleton width="95%" /><Skeleton width="90%" /><Skeleton width="60%" /><span className="s-sr">Writing your adaptation</span></div>}
            {error && (error.plan ? <PlanNotice error={error.plan} compact /> : (
              <p className="rf-error" role="alert">{error.text} <Button size="sm" variant="ghost" onClick={() => adapt(open, list.length > 0)}>Try again</Button></p>
            ))}

            {a && (
              <div className="rf-adapt" aria-busy={busy}>
                {list.length > 1 && (
                  <div className="rf-versions" role="group" aria-label="Adaptations">
                    {list.map((_, i) => <button key={i} type="button" className={`rf-ver${i === pick ? " is-on" : ""}`} aria-pressed={i === pick} onClick={() => setPick(i)}>Version {i + 1}</button>)}
                  </div>
                )}
                <h3>{a.concept}</h3>
                {a.hook && <p className="rf-hook">&ldquo;{a.hook}&rdquo;</p>}
                <dl className="rf-facts">
                  <div><dt>Length</dt><dd>About {a.durationSec} seconds</dd></div>
                  {a.cta && <div><dt>Call to action</dt><dd>{a.cta}</dd></div>}
                </dl>
                {a.keeps && <p className="rf-keeps"><b>From the original:</b> {a.keeps}</p>}
                <h4>How to film it</h4>
                <ol className="rf-steps">{a.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
                {a.shots.length > 0 && (<><h4>Shots</h4><ul className="rf-list">{a.shots.map((s, i) => <li key={i}>{s}</li>)}</ul></>)}
                {a.editing && (<><h4>Editing</h4><p>{a.editing}</p></>)}
                {a.onScreenText.length > 0 && (<><h4>On-screen text</h4><ul className="rf-list">{a.onScreenText.map((s, i) => <li key={i}>&ldquo;{s}&rdquo;</li>)}</ul></>)}
                {a.why && (<><h4>Why it could work</h4><p>{a.why}</p></>)}
                <div className="rf-panel-actions">
                  <Button variant="primary" onClick={() => make(open, a)}><Clapperboard size={14} aria-hidden /> Make this video</Button>
                  <Link href={`/plan?idea=${encodeURIComponent(`${a.concept}${a.hook ? ` Opening: "${a.hook}"` : ""}`.slice(0, 280))}`} className="ov-btn outline small"><Plus size={13} aria-hidden /> Add to my plan</Link>
                  <button type="button" className="ov-btn ghost small" onClick={() => copyBrief(`a:${panelKey}:${pick}`, adaptationText(a, open))}>
                    {copied === `a:${panelKey}:${pick}` ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />} {copied === `a:${panelKey}:${pick}` ? "Copied" : "Copy brief"}
                  </button>
                  <Button size="sm" variant="ghost" busy={busy} disabled={busy || list.length >= ADAPTATIONS_PER_REEL} onClick={() => adapt(open, true)} title={list.length >= ADAPTATIONS_PER_REEL ? "You've had the most adaptations for this Reel. Pick one of them." : undefined}>
                    <RefreshCw size={13} aria-hidden /> Try another adaptation ({ADAPTATIONS_PER_REEL - list.length} left)
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}
