"use client";

// The discovery surface: accounts and content SOCIA found on its own.
//
// Every value here is either a verified public metric or absent. Web-discovered
// leads carry no metrics at all by design, and the label on each card says
// which it is, so "Public API" and "Web discovery" can never be confused.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, ExternalLink, Loader2, RefreshCw, Info, ArrowRight, Check, Sparkles, PauseCircle,
} from "lucide-react";
import { AI_UNAVAILABLE_COPY } from "@/lib/aiStatus";
import { CLASSIFICATION_LABEL, type Classification, type ScoredAccount, type ScoredContent, type TrendRollup } from "@/lib/discovery";

type Sources = { youtube: "ok" | "not_configured" | "failed"; web: string };
type IntelDoc = {
  accounts: ScoredAccount[];
  content: ScoredContent[];
  trends: TrendRollup[];
  ranAt: string | null;
  sources: Sources;
  profileGaps: string[];
};

const fmtN = (n: number | null | undefined): string =>
  n == null ? "—"
  : n >= 1e9 ? (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B"
  : n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M"
  : n >= 1e4 ? Math.round(n / 1e3) + "K"
  : n.toLocaleString("en-US");

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  return `${Math.round(hrs / 24)} day${Math.round(hrs / 24) === 1 ? "" : "s"} ago`;
}

const PLATFORMS = ["all", "youtube", "instagram", "facebook"] as const;
type PlatFilter = (typeof PLATFORMS)[number];

const GROUPS: { id: Classification; label: string }[] = [
  { id: "direct_competitor", label: "Direct competitors" },
  { id: "local_competitor", label: "Local" },
  { id: "niche_leader", label: "Niche leaders" },
  { id: "content_inspiration", label: "Content leaders" },
  { id: "emerging_creator", label: "Emerging" },
  { id: "adjacent_competitor", label: "Adjacent" },
];

const sourceLabel = (s: string) =>
  s === "youtube_api" ? "Public API" : s === "instagram_api" ? "Verified account data" : "Web discovery";

export default function CompetitorDiscovery({
  trackedKeys,
  ownHandle,
}: {
  trackedKeys: string[];
  ownHandle: string | null;
}) {
  const router = useRouter();
  const [doc, setDoc] = useState<IntelDoc | null>(null);
  const [phase, setPhase] = useState<string>("Finding relevant accounts…");
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [plat, setPlat] = useState<PlatFilter>("all");
  const [sort, setSort] = useState<"relevant" | "performing" | "newest">("relevant");
  const [tracked, setTracked] = useState<Set<string>>(() => new Set(trackedKeys));
  const [adding, setAdding] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    setState("loading");
    setPhase(refresh ? "Researching your niche…" : "Loading your intelligence…");
    try {
      const res = await fetch(`/api/competitors/intel${refresh ? "?refresh=1" : ""}`);
      const j = await res.json();
      if (!res.ok) {
        setState("error");
        return;
      }
      setDoc(j as IntelDoc);
      setState("ok");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Honest progress: the phases reflect what the request is actually doing.
  useEffect(() => {
    if (state !== "loading") return;
    const steps = ["Finding relevant accounts…", "Analysing recent niche content…", "Ranking for your goal…"];
    let i = 0;
    const t = setInterval(() => {
      i = (i + 1) % steps.length;
      setPhase(steps[i]);
    }, 2200);
    return () => clearInterval(t);
  }, [state]);

  const track = useCallback(
    async (platform: string, handle: string | null) => {
      if (!handle) return;
      const key = `${platform}:${handle.toLowerCase()}`;
      if (tracked.has(key) || adding) return;
      setAdding(key);
      try {
        const res = await fetch("/api/competitors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle, platform }),
        });
        if (res.ok) {
          setTracked((s) => new Set(s).add(key));
          router.refresh();
        }
      } finally {
        setAdding(null);
      }
    },
    [tracked, adding, router],
  );

  const accounts = useMemo(() => {
    const xs = (doc?.accounts ?? []).filter((a) => plat === "all" || a.platform === plat);
    return xs.filter((a) => !ownHandle || a.handle?.toLowerCase() !== ownHandle.toLowerCase());
  }, [doc, plat, ownHandle]);

  const content = useMemo(() => {
    const xs = (doc?.content ?? []).filter((c) => plat === "all" || c.platform === plat);
    if (sort === "performing") {
      // Only a real multiplier ranks; unknown never outranks known.
      return [...xs].sort((a, b) => (b.multiplier ?? -1) - (a.multiplier ?? -1));
    }
    if (sort === "newest") {
      return [...xs].sort(
        (a, b) => new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime(),
      );
    }
    return [...xs].sort((a, b) => b.relevanceScore - a.relevanceScore);
  }, [doc, plat, sort]);

  if (state === "loading") {
    return (
      <div className="cpd-loading">
        <Loader2 size={15} className="cp4-spin" /> {phase}
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="cp4-win-empty">
        <b>Discovery is unavailable right now.</b>
        <button type="button" className="btn-primary" onClick={() => load(true)}>Try again</button>
      </div>
    );
  }

  const webDown = doc?.sources.web && doc.sources.web !== "ok";
  const ytDown = doc?.sources.youtube !== "ok";

  return (
    <div className="cpd">
      {/* controls */}
      <div className="cpd-bar">
        <span className="cp4-chipset">
          {PLATFORMS.map((p) => (
            <button key={p} type="button" className={`cp4-chip${plat === p ? " on" : ""}`} onClick={() => setPlat(p)}>
              {p === "all" ? "All" : p === "youtube" ? "YouTube" : p === "instagram" ? "Instagram" : "Facebook"}
            </button>
          ))}
        </span>
        <span className="cpd-spacer" />
        {doc?.ranAt && <small className="cpd-updated">Updated {ago(doc.ranAt)}</small>}
        <button type="button" className="cpd-refresh" onClick={() => load(true)}>
          <RefreshCw size={13} /> Refresh discovery
        </button>
      </div>

      {doc && doc.profileGaps.length > 0 && (
        <div className="cpd-gap">
          <Sparkles size={14} />
          <span>
            <b>Improve recommendations</b>
            <p>SOCIA doesn&apos;t know your {doc.profileGaps.join(", ")} yet — adding it sharpens who and what it finds.</p>
          </span>
          <a href="/settings#brand">Complete profile <ArrowRight size={12} /></a>
        </div>
      )}

      {/* ---------- content ---------- */}
      <div className="cp4-sec-head cpd-head">
        <h2>Winning content in your niche</h2>
        <span className="cp4-chipset cpd-sort">
          {(["relevant", "performing", "newest"] as const).map((s) => (
            <button key={s} type="button" className={`cp4-chip${sort === s ? " on" : ""}`} onClick={() => setSort(s)}>
              {s === "relevant" ? "Most relevant" : s === "performing" ? "Highest performing" : "Newest"}
            </button>
          ))}
        </span>
      </div>
      {content.length ? (
        <div className="cp4-win-grid">
          {content.slice(0, 8).map((c) => (
            <ContentCard key={c.contentUrl} c={c} />
          ))}
        </div>
      ) : (
        <p className="cp4-empty">
          {ytDown && webDown
            ? "No content sources are available right now."
            : "Not enough verified results yet — try Refresh discovery."}
        </p>
      )}
      {webDown && (
        <div className="cp4-paused cpd-inline">
          <span className="cp4-paused-ico"><PauseCircle size={15} /></span>
          <div>
            <b>Instagram and Facebook discovery is paused</b>
            <p>
              {AI_UNAVAILABLE_COPY[doc!.sources.web as keyof typeof AI_UNAVAILABLE_COPY] ??
                "Web research couldn't be reached."}{" "}
              YouTube results above are unaffected — they come from Google&apos;s API.
            </p>
          </div>
        </div>
      )}

      {/* ---------- trends ---------- */}
      {doc && doc.trends.length > 0 && (
        <>
          <div className="cp4-sec-head cpd-head"><h2>Patterns winning right now</h2>
            <small>Detected across the {doc.content.length} posts SOCIA found — counts, not estimates</small>
          </div>
          <ol className="cp4-patterns">
            {doc.trends.slice(0, 6).map((t, i) => (
              <li key={t.tag}>
                <span className="cp4-pat-num">{String(i + 1).padStart(2, "0")}</span>
                <span className="cp4-pat-meta">
                  <b>{t.tag}</b>
                  <small>
                    In {t.count} of {doc.content.length} discovered posts
                    {t.medianMultiplier != null && ` · median ${t.medianMultiplier.toFixed(1)}× creator normal`}
                  </small>
                </span>
                <b className="cp4-pat-pct up">{t.share}%<em>of finds</em></b>
              </li>
            ))}
          </ol>
        </>
      )}

      {/* ---------- accounts ---------- */}
      <div className="cp4-sec-head cpd-head">
        <h2>Explore more competitors</h2>
        <small>{accounts.length} accounts SOCIA found · track one to monitor it</small>
      </div>
      {accounts.length === 0 ? (
        <p className="cp4-empty">No accounts found for this filter.</p>
      ) : (
        GROUPS.map(({ id, label }) => {
          const group = accounts.filter((a) => a.classification === id);
          if (!group.length) return null;
          return (
            <div className="cpd-group" key={id}>
              <small className="cp4-disc-label">{label.toUpperCase()}<em>{group.length}</em></small>
              <div className="cp4-disc-grid">
                {group.slice(0, 8).map((a) => {
                  const key = `${a.platform}:${(a.handle ?? "").toLowerCase()}`;
                  const isTracked = tracked.has(key);
                  return (
                    <article className="cp4-disc cpd-acct" key={`${a.platform}:${a.platformAccountId}`}>
                      <div className="cpd-acct-top">
                        {a.profileImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img className="cp4-face" src={a.profileImage} alt="" width={40} height={40} />
                        ) : (
                          <span className="cp4-face ph">{(a.displayName ?? a.handle ?? "?")[0]?.toUpperCase()}</span>
                        )}
                        <span className={`cp4-plat ${a.platform}`}>{a.platform === "youtube" ? "YouTube" : a.platform === "facebook" ? "Facebook" : "Instagram"}</span>
                      </div>
                      <b className="cp4-disc-name">{a.displayName ?? `@${a.handle}`}</b>
                      <small className="cpd-acct-num">
                        {a.followers != null ? (
                          <><b>{fmtN(a.followers)}</b> {a.platform === "youtube" ? "subscribers" : "followers"}</>
                        ) : (
                          <span title="This platform doesn't publish follower counts to third parties.">Followers not published</span>
                        )}
                      </small>
                      <span className="cpd-why" title={a.relevanceReasons.join(" · ")}>
                        <em>{a.relevanceScore}% relevant</em>
                        {a.relevanceReasons.slice(0, 2).join(" · ")}
                      </span>
                      <div className="cp4-disc-actions">
                        <a href={a.profileUrl ?? "#"} target="_blank" rel="noreferrer">View <ExternalLink size={11} /></a>
                        <button
                          type="button"
                          onClick={() => track(a.platform, a.handle)}
                          disabled={isTracked || adding === key || !a.handle}
                        >
                          {isTracked ? <><Check size={12} /> Tracked</>
                            : adding === key ? <Loader2 size={12} className="cp4-spin" />
                            : <><Plus size={12} /> Track</>}
                        </button>
                      </div>
                      <small className="cpd-src">{sourceLabel(a.dataSource)}</small>
                    </article>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      <p className="cp4-note">
        <Info size={11} /> YouTube figures come from its official API. Instagram and Facebook publish
        no analytics for accounts you don&apos;t own, so those cards carry a link and a reason but no
        metrics — SOCIA shows nothing rather than an estimate.
      </p>
    </div>
  );
}

function ContentCard({ c }: { c: ScoredContent }) {
  const ask = `I want to adapt this ${c.platform === "youtube" ? "YouTube Short" : "Reel"} for my account: "${c.title ?? c.contentUrl}"${c.accountName ? ` by ${c.accountName}` : ""}.
${c.trendTags.length ? `Format detected: ${c.trendTags.join(", ")}.` : ""}
Break down its likely structure second by second, then give me a version for my own business with a hook, shot list, and caption.`;
  return (
    <article className="cp4-win">
      <a className="cp4-win-media" href={c.contentUrl} target="_blank" rel="noreferrer" aria-label="Open the original post">
        {c.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.thumbnailUrl} alt="" loading="lazy" />
        ) : (
          <span className="cp4-win-ph">{c.platform === "youtube" ? "Short" : "Reel"}</span>
        )}
        <span className="cp4-win-platform">
          {c.platform === "youtube" ? "Shorts" : c.platform === "facebook" ? "Facebook" : "Reel"}
        </span>
        {c.multiplier != null && c.multiplier >= 1.2 && (
          <span className="cp4-win-views" title="This video's views divided by that creator's own median — both real public numbers.">
            {c.multiplier.toFixed(1)}× normal
          </span>
        )}
      </a>
      <div className="cp4-win-body">
        <span className="cp4-win-creator">
          {c.accountName ?? "Unknown creator"}
          <em>{c.relevanceScore}% relevant</em>
        </span>
        <b className="cp4-win-title">{c.title ?? "(untitled)"}</b>
        <div className="cpd-metrics">
          <span><b>{fmtN(c.views)}</b><small>views</small></span>
          <span><b>{fmtN(c.likes)}</b><small>likes</small></span>
          <span>
            <b>{c.publishedAt ? new Date(c.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</b>
            <small>published</small>
          </span>
        </div>
        <p className="cp4-win-why" title={c.relevanceReasons.join(" · ")}>
          <span>WHY IT MATTERS</span>
          {c.why ?? c.relevanceReasons.slice(0, 3).join(" · ")}
        </p>
        <div className="cp4-win-actions">
          <a href={c.contentUrl} target="_blank" rel="noreferrer">View original</a>
          <a className="cp4-win-use" href={`/chat?q=${encodeURIComponent(ask)}`}>
            Use this pattern <ArrowRight size={12} />
          </a>
        </div>
      </div>
    </article>
  );
}
