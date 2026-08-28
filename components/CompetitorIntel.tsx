"use client";

// Competitor Intelligence — client pieces.
//
// Honesty contract for this whole page:
//   - the user's own numbers come from their authenticated Instagram data
//   - tracked competitors are handles the USER chose; platforms expose no
//     analytics for other accounts, so their metrics render "—", never guesses
//   - "What's winning" posts are real posts by OTHER creators found by live
//     web search ("Trending creator" — not necessarily a competitor), with
//     view counts only as the platform page reported them
//   - pattern momentum comes from the niche-trends web research and is
//     labeled as an AI estimate, never presented as measured platform data

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  X,
  ExternalLink,
  Loader2,
  Play,
  Image as ImageIcon,
  ArrowRight,
  AtSign,
  Users,
  Settings2,
  Info,
} from "lucide-react";
import type { ViralDoc, ViralItem } from "@/app/api/niche-viral/route";

export type Tracked = { platform: string; handle: string; added_at: string };

const profileUrl = (c: Tracked) =>
  c.platform === "facebook"
    ? `https://facebook.com/${c.handle}`
    : c.platform === "youtube"
      ? `https://youtube.com/@${c.handle}`
      : `https://instagram.com/${c.handle}`;

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return mins < 2 ? "just now" : `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/* ------------------------------------------------------------------ */
/* Manage competitors: add/remove tracked handles                      */
/* ------------------------------------------------------------------ */

export function ManageCompetitors({ initial }: { initial: Tracked[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Tracked[]>(initial);
  const [handle, setHandle] = useState("");
  const [platform, setPlatform] = useState<"instagram" | "youtube">("instagram");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const add = useCallback(async () => {
    const h = handle.trim().replace(/^@/, "");
    if (!h || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: h, platform }),
      });
      const j = await res.json();
      if (!res.ok) {
        setErr(j.error ?? "Couldn't add that handle.");
        return;
      }
      setList((xs) =>
        xs.some((x) => x.handle === h.toLowerCase() && x.platform === platform)
          ? xs
          : [...xs, { platform, handle: h.toLowerCase(), added_at: new Date().toISOString() }],
      );
      setHandle("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }, [handle, busy, router, platform]);

  const remove = useCallback(
    async (c: Tracked) => {
      setList((xs) => xs.filter((x) => !(x.handle === c.handle && x.platform === c.platform)));
      await fetch("/api/competitors", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: c.handle, platform: c.platform }),
      });
      router.refresh();
    },
    [router],
  );

  return (
    <>
      <button className="btn-primary cp4-manage" type="button" onClick={() => setOpen(true)}>
        <Settings2 size={14} /> Manage competitors
      </button>
      {open && (
        <div className="cp4-modal-wrap" role="dialog" aria-modal="true" aria-label="Manage competitors">
          <div className="cp4-scrim" onClick={() => setOpen(false)} />
          <div className="cp4-modal">
            <div className="cp4-modal-head">
              <h3>Tracked competitors</h3>
              <button type="button" className="cp4-x" onClick={() => setOpen(false)} aria-label="Close">
                <X size={15} />
              </button>
            </div>
            <div className="cp4-platpick" role="group" aria-label="Platform">
              {(["instagram", "youtube"] as const).map((p) => (
                <button key={p} type="button" className={platform === p ? "on" : ""} onClick={() => setPlatform(p)}>
                  {p === "instagram" ? "Instagram" : "YouTube"}
                </button>
              ))}
            </div>
            <p className="cp4-modal-sub">
              {platform === "instagram"
                ? "Instagram publishes no analytics for accounts you don't own, so SOCIA links their public profile and flags their posts in niche research — it never invents their stats."
                : "YouTube publishes real statistics for any channel, so SOCIA shows their actual subscribers, views, upload cadence and engagement. Paste a @handle, channel URL, or channel ID."}
            </p>
            <div className="cp4-add">
              <span className="cp4-at"><AtSign size={13} /></span>
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
                placeholder={platform === "youtube" ? "@channel, URL, or channel ID" : "competitor handle"}
                aria-label="Competitor handle"
              />
              <button type="button" className="btn-primary" onClick={add} disabled={busy || !handle.trim()}>
                {busy ? <Loader2 size={14} className="cp4-spin" /> : <Plus size={14} />} Add
              </button>
            </div>
            {err && <p className="cp4-err">{err}</p>}
            <ul className="cp4-mlist">
              {list.map((c) => (
                <li key={c.platform + c.handle}>
                  <span className="cp4-mavatar">{c.handle[0]?.toUpperCase()}</span>
                  <span className="cp4-mmeta">
                    <b>@{c.handle}</b>
                    <small>{c.platform === "youtube" ? "YouTube" : c.platform === "facebook" ? "Facebook" : "Instagram"} · tracking since {new Date(c.added_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</small>
                  </span>
                  <a href={profileUrl(c)} target="_blank" rel="noreferrer" className="cp4-mopen" aria-label={`Open @${c.handle} on Instagram`}>
                    <ExternalLink size={13} />
                  </a>
                  <button type="button" className="cp4-mdel" onClick={() => remove(c)} aria-label={`Stop tracking @${c.handle}`}>
                    <X size={13} />
                  </button>
                </li>
              ))}
              {list.length === 0 && <li className="cp4-mempty">No competitors tracked yet.</li>}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Competitor strip: YOU (real numbers) + tracked handles              */
/* ------------------------------------------------------------------ */

export function CompetitorStrip({
  you,
  tracked,
  onOpenDetail,
}: {
  you: {
    username: string | null;
    avatar: string | null;
    followers: number | null;
    engRate: number | null;
    spark: number[];
  };
  tracked: Tracked[];
  onOpenDetail?: (c: Tracked) => void;
}) {
  const [detail, setDetail] = useState<Tracked | null>(null);
  const openDetail = onOpenDetail ?? setDetail;

  return (
    <>
      <div className="cp4-strip" role="list">
        <article className="cp4-acct you" role="listitem">
          <span className="cp4-youtag">YOU</span>
          {you.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="cp4-face" src={you.avatar} alt="" width={40} height={40} />
          ) : (
            <span className="cp4-face ph"><Users size={16} /></span>
          )}
          <b className="cp4-handle">@{you.username ?? "your account"}</b>
          <div className="cp4-nums">
            <span><b>{you.followers != null ? you.followers.toLocaleString("en-US") : "—"}</b><small>Followers</small></span>
            <span><b>{you.engRate != null ? `${you.engRate.toFixed(1)}%` : "—"}</b><small>Eng. rate</small></span>
          </div>
          {you.spark.length >= 3 && (
            <svg className="cp4-spark" viewBox="0 0 84 20" preserveAspectRatio="none" aria-hidden>
              <polyline
                fill="none"
                stroke="#2563ff"
                strokeWidth="1.6"
                points={you.spark
                  .map((v, i) => {
                    const mn = Math.min(...you.spark);
                    const mx = Math.max(...you.spark);
                    const y = 17 - ((v - mn) / Math.max(1, mx - mn)) * 14;
                    return `${(i / (you.spark.length - 1)) * 84},${y}`;
                  })
                  .join(" ")}
              />
            </svg>
          )}
        </article>

        {tracked.map((c) => (
          <article className="cp4-acct" role="listitem" key={c.platform + c.handle}>
            <button type="button" className="cp4-acct-open" onClick={() => openDetail(c)} aria-label={`Open @${c.handle} details`}>
              <span className="cp4-face ph">{c.handle[0]?.toUpperCase()}</span>
              <b className="cp4-handle">@{c.handle}</b>
              <div className="cp4-nums">
                <span><b>—</b><small>Followers</small></span>
                <span><b>—</b><small>Eng. rate</small></span>
              </div>
              <small className="cp4-nodata" title="Instagram doesn't expose other accounts' analytics. SOCIA shows a dash instead of a guess.">
                Public metrics unavailable
              </small>
            </button>
          </article>
        ))}

        <ManageAddCard />
      </div>
      {detail && <CompetitorDrawer c={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

function ManageAddCard() {
  return (
    <article className="cp4-acct add" role="listitem">
      <button
        type="button"
        className="cp4-addbtn"
        onClick={() => (document.querySelector(".cp4-manage") as HTMLButtonElement | null)?.click()}
      >
        <span className="cp4-addring"><Plus size={16} /></span>
        Add competitor
      </button>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Competitor detail drawer — verified public info only                */
/* ------------------------------------------------------------------ */

export function CompetitorDrawer({ c, onClose }: { c: Tracked; onClose: () => void }) {
  const [found, setFound] = useState<ViralItem[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/niche-viral")
      .then((r) => (r.ok ? r.json() : null))
      .then((doc: ViralDoc | null) => {
        if (!alive) return;
        const mine = (doc?.items ?? []).filter((it) =>
          it.creator.replace(/^@/, "").toLowerCase().includes(c.handle.toLowerCase()),
        );
        setFound(mine);
      })
      .catch(() => alive && setFound([]));
    return () => {
      alive = false;
    };
  }, [c.handle]);

  return (
    <div className="cp4-modal-wrap" role="dialog" aria-modal="true" aria-label={`@${c.handle} details`}>
      <div className="cp4-scrim" onClick={onClose} />
      <aside className="cp4-drawer">
        <div className="cp4-modal-head">
          <span className="cp4-face ph big">{c.handle[0]?.toUpperCase()}</span>
          <div className="cp4-drawer-id">
            <h3>@{c.handle}</h3>
            <small>Instagram · tracked since {new Date(c.added_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</small>
          </div>
          <button type="button" className="cp4-x" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>

        <a className="cp4-drawer-visit" href={profileUrl(c)} target="_blank" rel="noreferrer">
          View public profile on Instagram <ExternalLink size={13} />
        </a>

        <div className="cp4-drawer-sec">
          <h4>Metrics</h4>
          <ul className="cp4-drawer-metrics">
            {["Followers", "Engagement rate", "Posting frequency", "Median views", "Reach"].map((m) => (
              <li key={m}><span>{m}</span><b>—</b></li>
            ))}
          </ul>
          <p className="cp4-drawer-note">
            <Info size={11} /> Instagram doesn&apos;t expose other accounts&apos; analytics to any
            third-party tool. SOCIA shows a dash instead of an estimate it can&apos;t verify.
          </p>
        </div>

        <div className="cp4-drawer-sec">
          <h4>Seen in niche research</h4>
          {found == null ? (
            <p className="cp4-drawer-note"><Loader2 size={12} className="cp4-spin" /> Checking web research…</p>
          ) : found.length ? (
            <ul className="cp4-drawer-found">
              {found.map((it) => (
                <li key={it.url}>
                  <a href={it.url} target="_blank" rel="noreferrer">
                    {it.title || it.url} <ExternalLink size={11} />
                  </a>
                  {it.views && <small>{it.views} views (platform-reported)</small>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="cp4-drawer-note">
              None of this account&apos;s posts have appeared in SOCIA&apos;s niche web research yet.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* What's winning right now — real web-discovered posts                */
/* ------------------------------------------------------------------ */

export function WinningNow({ trackedHandles }: { trackedHandles: string[] }) {
  const [doc, setDoc] = useState<ViralDoc | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "empty" | "error">("loading");

  const load = useCallback(async (refresh = false) => {
    setState("loading");
    try {
      const res = await fetch(`/api/niche-viral${refresh ? "?refresh=1" : ""}`);
      if (!res.ok) throw new Error();
      const j = (await res.json()) as ViralDoc;
      setDoc(j);
      setState(j.items?.length ? "ok" : "empty");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (state === "loading") {
    return (
      <div className="cp4-win-grid">
        {[0, 1, 2, 3].map((i) => <div className="cp4-win-skel" key={i} />)}
      </div>
    );
  }
  if (state === "error" || state === "empty") {
    return (
      <div className="cp4-win-empty">
        <b>{state === "error" ? "Web research is unavailable right now." : "No niche posts found yet."}</b>
        <p>SOCIA finds real posts by other creators via live web search — nothing is invented.</p>
        <button type="button" className="btn-primary" onClick={() => load(true)}>Search again</button>
      </div>
    );
  }

  const items = (doc?.items ?? []).slice(0, 4);
  return (
    <div className="cp4-win-grid">
      {items.map((it, i) => {
        const handle = it.creator.replace(/^@/, "");
        const isTracked = trackedHandles.some((h) => handle.toLowerCase().includes(h));
        const ask = `I want to adapt this trending ${it.platform === "tiktok" ? "TikTok" : "YouTube Short"} for my account: "${it.title}" by @${handle}. Why it may be working: ${it.why} Give me a concrete version for my niche with a hook, shot list, and caption.`;
        return (
          <article className="cp4-win" key={it.url} style={{ animationDelay: `${i * 60}ms` }}>
            <a className="cp4-win-media" href={it.url} target="_blank" rel="noreferrer" aria-label="Open the original post">
              {it.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.thumb} alt="" loading="lazy" />
              ) : (
                <span className="cp4-win-ph"><ImageIcon size={24} /></span>
              )}
              <span className="cp4-win-platform">{it.platform === "tiktok" ? "TikTok" : "Shorts"}</span>
              {it.views && (
                <span className="cp4-win-views" title="View count as reported by the platform page where SOCIA found this — not independently verified.">
                  <Play size={10} /> {it.views}
                </span>
              )}
            </a>
            <div className="cp4-win-body">
              <span className={`cp4-win-creator${isTracked ? " tracked" : ""}`}>
                <AtSign size={11} /> {handle}
                <em>{isTracked ? "Tracked competitor" : "Trending creator"}</em>
              </span>
              <b className="cp4-win-title">{it.title || "(untitled)"}</b>
              <p className="cp4-win-why" title="AI interpretation of why this may have performed — not a measured statistic.">
                <span>WHY IT MAY WORK</span> {it.why}
              </p>
              <div className="cp4-win-actions">
                <a href={it.url} target="_blank" rel="noreferrer">View original</a>
                <a className="cp4-win-use" href={`/chat?q=${encodeURIComponent(ask)}`}>
                  Use this pattern <ArrowRight size={12} />
                </a>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Breakdown table row that opens the drawer                           */
/* ------------------------------------------------------------------ */

export function BreakdownRows({ tracked }: { tracked: Tracked[] }) {
  const [detail, setDetail] = useState<Tracked | null>(null);
  return (
    <>
      {tracked.map((c) => (
        <tr key={c.platform + c.handle} className="cp4-brow" onClick={() => setDetail(c)} tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && setDetail(c)}>
          <td>
            <span className="cp4-face ph sm">{c.handle[0]?.toUpperCase()}</span>
            <b>@{c.handle}</b>
          </td>
          <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
          <td><span className="cp4-open-hint">Details</span></td>
        </tr>
      ))}
      {detail && <CompetitorDrawer c={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* YouTube competitors — REAL public stats from YouTube's official API */
/* ------------------------------------------------------------------ */

type YtRow = {
  handle: string;
  found: boolean;
  title?: string;
  avatar?: string | null;
  url?: string;
  subscribers?: number | null;
  lifetimeViews?: number | null;
  videoCount?: number | null;
  uploadsPerWeek?: number | null;
  engagementRate?: number | null;
  medianViews?: number | null;
  topVideos?: { videoId: string; title: string; url: string; views: number | null; likes: number | null; publishedAt: string }[];
};

const fmtN = (n: number | null | undefined): string =>
  n == null ? "—"
  : n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M"
  : n >= 1e4 ? Math.round(n / 1e3) + "K"
  : n.toLocaleString("en-US");

export function YouTubeCompetitors({ hasTracked }: { hasTracked: boolean }) {
  const [rows, setRows] = useState<YtRow[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [open, setOpen] = useState<YtRow | null>(null);

  useEffect(() => {
    if (!hasTracked) {
      setRows([]);
      return;
    }
    let alive = true;
    fetch("/api/competitors/youtube")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j) return;
        setConfigured(j.configured !== false);
        setRows(j.channels ?? []);
      })
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [hasTracked]);

  if (!hasTracked) {
    return (
      <p className="cp4-empty">
        Track a YouTube channel with Manage competitors — YouTube publishes real statistics, so these
        columns fill with its actual subscribers, views, cadence and engagement.
      </p>
    );
  }
  if (rows == null) return <div className="cp4-yt-skel" />;
  if (!configured) {
    return <p className="cp4-empty">YouTube isn&apos;t configured on the server yet (missing API key).</p>;
  }

  return (
    <>
      <div className="cp4-tablewrap">
        <table className="cp4-table">
          <thead>
            <tr>
              <th>Channel</th><th>Subscribers</th><th>Lifetime views</th>
              <th>Median views</th><th>Uploads / week</th><th>Eng. rate</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) =>
              r.found ? (
                <tr key={r.handle} className="cp4-brow" onClick={() => setOpen(r)} tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && setOpen(r)}>
                  <td>
                    {r.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="cp4-face sm" src={r.avatar} alt="" width={26} height={26} />
                    ) : <span className="cp4-face ph sm">{r.handle[0]?.toUpperCase()}</span>}
                    <b>{r.title || `@${r.handle}`}</b>
                  </td>
                  <td className="cp4-real">{fmtN(r.subscribers)}</td>
                  <td className="cp4-real">{fmtN(r.lifetimeViews)}</td>
                  <td className="cp4-real">{fmtN(r.medianViews)}</td>
                  <td className="cp4-real">{r.uploadsPerWeek != null ? r.uploadsPerWeek.toFixed(1) : "—"}</td>
                  <td className="cp4-real">{r.engagementRate != null ? `${r.engagementRate.toFixed(1)}%` : "—"}</td>
                  <td><span className="cp4-open-hint">Details</span></td>
                </tr>
              ) : (
                <tr key={r.handle}>
                  <td><span className="cp4-face ph sm">?</span><b>@{r.handle}</b></td>
                  <td colSpan={6} className="cp4-na">Channel not found on YouTube</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      <p className="cp4-note">
        <Info size={11} /> Real public data from YouTube&apos;s official API — the same numbers any
        visitor sees. Engagement rate is the median of (likes + comments) ÷ views across recent
        uploads. A hidden subscriber count shows &ldquo;—&rdquo;, never a guess.
      </p>
      {open && (
        <div className="cp4-modal-wrap" role="dialog" aria-modal="true" aria-label={`${open.title} details`}>
          <div className="cp4-scrim" onClick={() => setOpen(null)} />
          <aside className="cp4-drawer">
            <div className="cp4-modal-head">
              {open.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="cp4-face big" src={open.avatar} alt="" width={46} height={46} />
              ) : <span className="cp4-face ph big">{open.handle[0]?.toUpperCase()}</span>}
              <div className="cp4-drawer-id">
                <h3>{open.title}</h3>
                <small>YouTube · {fmtN(open.videoCount)} videos published</small>
              </div>
              <button type="button" className="cp4-x" onClick={() => setOpen(null)} aria-label="Close"><X size={15} /></button>
            </div>
            <a className="cp4-drawer-visit" href={open.url} target="_blank" rel="noreferrer">
              View channel on YouTube <ExternalLink size={13} />
            </a>
            <div className="cp4-drawer-sec">
              <h4>Public metrics</h4>
              <ul className="cp4-drawer-metrics">
                <li><span>Subscribers</span><b className="real">{fmtN(open.subscribers)}</b></li>
                <li><span>Lifetime views</span><b className="real">{fmtN(open.lifetimeViews)}</b></li>
                <li><span>Videos published</span><b className="real">{fmtN(open.videoCount)}</b></li>
                <li><span>Uploads / week</span><b className="real">{open.uploadsPerWeek != null ? open.uploadsPerWeek.toFixed(1) : "—"}</b></li>
                <li><span>Median views (recent)</span><b className="real">{fmtN(open.medianViews)}</b></li>
                <li><span>Engagement rate</span><b className="real">{open.engagementRate != null ? `${open.engagementRate.toFixed(1)}%` : "—"}</b></li>
              </ul>
            </div>
            {open.topVideos && open.topVideos.length > 0 && (
              <div className="cp4-drawer-sec">
                <h4>Top recent uploads</h4>
                <ul className="cp4-drawer-found">
                  {open.topVideos.map((v) => (
                    <li key={v.videoId}>
                      <a href={v.url} target="_blank" rel="noreferrer">{v.title} <ExternalLink size={11} /></a>
                      <small>{fmtN(v.views)} views · {fmtN(v.likes)} likes · {new Date(v.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</small>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
