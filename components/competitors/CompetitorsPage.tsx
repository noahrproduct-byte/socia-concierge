"use client";

// Competitors, laid out as a command center: verdicts first (intelligence
// strip), then the market (chip carousel), then the evidence — trajectory,
// score, gaps, content intelligence — and finally the move SOCIA recommends.
// Selection is client state; every section re-derives from the selected
// competitor without a reload. The honesty contract from page.tsx holds
// everywhere: real numbers keep provenance, absences keep their reason.

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Link2, Activity } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { askSocia } from "@/lib/ask";
import { absent, type LeaderRow } from "@/lib/competitorRollup";
import { compareRows, leadsOn, pickMostSimilar, similarity, type SimilarPick } from "@/lib/similarCompetitor";
import { groupedPatterns, learnings, reasonsFor, type CompetitorRow, type Reason } from "@/lib/competitorIntel";
import { engagementRank, performanceScore } from "@/lib/competitorScore";
import type { NichePost } from "@/lib/nicheTrends";
import type { CompetitorsData } from "./types";
import { PlatformSelect, RangeSelect, RefreshButton } from "./Controls";
import Roster from "./Roster";
import IntelStrip from "./IntelStrip";
import { GapBars, NextMove, ProfileBar, WhyWinning } from "./SelectedCompetitor";
import { ContentMix, ContentUnlock, TopContent, WhenTheyPost } from "./PatternsRow";
import { Radar, Scatter, ScoreRing, Trajectory, type Pt, type ScatterPost } from "./viz";
import NicheSection from "./NicheSection";
import NicheDrawer from "./NicheDrawer";
import EvidenceDrawer, { type Evidence } from "./EvidenceDrawer";
import AddCompetitor from "./AddCompetitor";
import { fmtN } from "./shared";

const fmtC = (unit: "count" | "pct" | "perWeek", v: number) => (unit === "pct" ? `${v.toFixed(1)}%` : unit === "perWeek" ? v.toFixed(1) : fmtN(v));

function placeholderYou(): LeaderRow {
  return {
    id: "you", platform: "instagram", handle: "you", name: "Your account", avatar: null, url: null, isYou: true, tracked: true, classification: null,
    audience: absent("connection_needed"), engagement: absent("connection_needed"), cadence: absent("connection_needed"),
    medianViews: absent("connection_needed"), momentum: absent("connection_needed"), match: null, topFormat: null,
  };
}

function agoText(iso: string, now: Date): string {
  const mins = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const d = Math.round(hrs / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

type Metric = "interactions" | "views" | "followers";

export default function CompetitorsPage({ d }: { d: CompetitorsData }) {
  const router = useRouter();
  const now = useMemo(() => new Date(d.now), [d.now]);
  const you = d.you ?? placeholderYou();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>("interactions");
  const [scatterFmt, setScatterFmt] = useState<string>("All");
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [openPost, setOpenPost] = useState<NichePost | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [tracking, setTracking] = useState<string | null>(null);
  const [savedItems, setSavedItems] = useState<NichePost[]>(d.saved);
  const [saving, setSaving] = useState<string | null>(null);
  const savedSet = useMemo(() => new Set(savedItems.map((p) => p.url)), [savedItems]);

  // Roster: platform filter, tracked accounts first, then by match.
  const roster = useMemo(() => {
    const rows = d.platform === "all" ? d.rows : d.rows.filter((r) => r.platform === d.platform);
    return [...rows].sort((a, b) => Number(b.tracked) - Number(a.tracked) || (b.match ?? -1) - (a.match ?? -1));
  }, [d.rows, d.platform]);

  // Rank badges: published engagement rates only — you plus every row that has one.
  const { ranks, youRank } = useMemo(() => {
    const rated = roster.filter((r) => r.engagement.state === "ok" && r.engagement.value != null).map((r) => ({ id: r.id, v: r.engagement.value! }));
    if (d.you?.engagement.state === "ok" && d.you.engagement.value != null) rated.push({ id: "you", v: d.you.engagement.value });
    rated.sort((a, b) => b.v - a.v);
    const map: Record<string, number> = {};
    rated.forEach((x, i) => { map[x.id] = i + 1; });
    return { ranks: map, youRank: map["you"] ?? null };
  }, [roster, d.you]);

  const autoPick = useMemo(() => (d.you ? pickMostSimilar([d.you, ...roster]) : null), [d.you, roster]);
  const active: CompetitorRow | null = useMemo(() => {
    const sel = selectedId ? roster.find((r) => r.id === selectedId) : null;
    if (sel) return sel;
    const auto = autoPick ? roster.find((r) => r.id === autoPick.row.id) : null;
    return auto ?? roster[0] ?? null;
  }, [roster, selectedId, autoPick]);

  const pick: SimilarPick | null = useMemo(() => active ? { row: active, similarity: similarity(you, active), leads: leadsOn(you, active), comparisons: compareRows(you, active) } : null, [active, you]);
  const patterns = useMemo(() => (active ? groupedPatterns(active.posts, d.location) : null), [active, d.location]);
  const reasons: Reason[] = useMemo(() => (pick ? reasonsFor(pick, Boolean(active?.topFormat && /Shorts|Reels/.test(active.topFormat))) : []), [pick, active]);
  const learn = useMemo(() => (pick && patterns ? learnings(pick, patterns) : []), [pick, patterns]);

  const score = useMemo(() => performanceScore(d.you), [d.you]);
  const rank = useMemo(() => engagementRank(d.you, roster), [d.you, roster]);
  const momentum = d.you && d.you.momentum.state === "ok" && d.you.momentum.value != null ? d.you.momentum.value : null;

  // ---- trajectory series (per-post, both sides real) ----------------------
  const yourPts = useMemo(() => {
    const src = d.youSeries ?? [];
    const pts: Record<Exclude<Metric, "followers">, Pt[]> = { interactions: [], views: [] };
    for (const p of src) {
      const t = new Date(p.t).getTime();
      if (Number.isNaN(t)) continue;
      pts.interactions.push({ t, v: p.interactions });
      if (p.views != null) pts.views.push({ t, v: p.views });
    }
    return pts;
  }, [d.youSeries]);

  const theirPts = useMemo(() => {
    const pts: Record<Exclude<Metric, "followers">, Pt[]> = { interactions: [], views: [] };
    for (const p of active?.posts ?? []) {
      if (!p.publishedAt) continue;
      const t = new Date(p.publishedAt).getTime();
      if (Number.isNaN(t)) continue;
      const inter = (p.likes ?? 0) + (p.comments ?? 0);
      if (p.likes != null || p.comments != null) pts.interactions.push({ t, v: inter });
      if (p.views != null) pts.views.push({ t, v: p.views });
    }
    return pts;
  }, [active]);

  const followerPts: Pt[] = useMemo(
    () => (d.followerSeries ?? []).map((r) => ({ t: new Date(`${r.day}T12:00:00`).getTime(), v: r.followers })).filter((p) => !Number.isNaN(p.t)),
    [d.followerSeries],
  );

  const themName = active?.name ?? "Competitor";
  const trajYou = metric === "followers" ? followerPts : yourPts[metric];
  const trajThem = metric === "followers" ? [] : theirPts[metric];
  const trajNote =
    metric === "followers" ? (followerPts.length >= 2 ? `Your daily follower snapshots. ${themName}'s history isn't published by any platform.` : "Follower history builds from SOCIA's daily snapshots after you connect.")
    : metric === "views" && trajThem.length === 0 && active?.platform === "instagram" ? `Instagram never publishes view counts for accounts you don't own — only ${themName}'s likes and comments are comparable.`
    : null;

  // ---- scatter ------------------------------------------------------------
  const scatterAll: ScatterPost[] = useMemo(() =>
    (active?.posts ?? [])
      .filter((p) => p.publishedAt && (p.views ?? p.likes) != null)
      .map((p) => ({
        url: p.url, title: p.title, thumb: p.thumb, format: p.format,
        t: new Date(p.publishedAt!).getTime(), y: (p.views ?? p.likes)!,
        comments: p.comments, multiplier: p.multiplier,
      }))
      .filter((p) => !Number.isNaN(p.t)),
    [active]);
  const scatterFormats = useMemo(() => ["All", ...[...new Set(scatterAll.map((p) => p.format).filter((f): f is string => Boolean(f)))].slice(0, 3)], [scatterAll]);
  const scatterPosts = scatterFmt === "All" ? scatterAll : scatterAll.filter((p) => p.format === scatterFmt);
  const scatterYLabel = scatterAll.some((p) => (active?.posts ?? []).find((q) => q.url === p.url)?.views != null) ? "Views" : "Likes";

  // ---- radar --------------------------------------------------------------
  const radarAxes = useMemo(() => {
    if (!pick) return [];
    const LABEL: Record<string, string> = { audience: "Audience", engagement: "Engagement", cadence: "Frequency", medianViews: "Reach" };
    return pick.comparisons
      .filter((c) => c.you.state === "ok" && c.them.state === "ok" && c.you.value != null && c.them.value != null)
      .map((c) => {
        const max = Math.max(c.you.value!, c.them.value!, 1e-9);
        return { label: LABEL[c.key] ?? c.key, you: c.you.value! / max, them: c.them.value! / max };
      });
  }, [pick]);

  const askContext = useCallback((question: string) => {
    if (!active || !pick) return;
    askSocia({
      question, autoSend: true,
      context: {
        page: "competitors", competitorId: active.id, competitorPlatform: active.platform, competitorName: active.name,
        comparisons: pick.comparisons.filter((c) => c.diffPct != null).map((c) => `${c.label}: me ${c.you.value != null ? fmtC(c.unit, c.you.value) : "—"}, them ${c.them.value != null ? fmtC(c.unit, c.them.value) : "—"} (${c.diffPct! > 0 ? "+" : ""}${Math.round(c.diffPct!)}%)`),
      },
      contextLabel: `Competitor: ${active.name}`,
    });
  }, [active, pick]);

  const track = useCallback(async (r: CompetitorRow) => {
    setTracking(r.id);
    try {
      await fetch("/api/competitors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle: r.handle, platform: r.platform }) });
      router.refresh();
    } finally { setTracking(null); }
  }, [router]);

  const toggleSave = useCallback(async (p: NichePost) => {
    setSaving(p.url);
    try {
      const isSaved = savedSet.has(p.url);
      const res = await fetch("/api/niche/saved", { method: isSaved ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(isSaved ? { url: p.url } : { item: p }) });
      if (res.ok) { const j = await res.json(); setSavedItems(j.items ?? []); }
    } finally { setSaving(null); }
  }, [savedSet]);

  const webPaused = d.sources && d.sources.web !== "ok";
  const opportunity = learn[0]?.title ?? (patterns && !patterns.insufficient && patterns.format[0] ? `More ${patterns.format[0].tag.toLowerCase()}` : null);

  return (
    <div className="cx cx2">
      <PageHeader
        title="Competitors"
        sub="See who's winning — and why."
        status={
          <span className="ov-status cx-status">
            <i className={d.lastRun ? "live" : ""} />
            {d.lastRun ? <>Live intelligence · {agoText(d.lastRun, now)}</> : <>No discovery run yet</>}
            {webPaused && <em className="cx-status-warn" title={`Web research: ${d.sources?.web}`}>· web research paused</em>}
            <RefreshButton />
          </span>
        }
        actions={
          <>
            <PlatformSelect value={d.platform} />
            <RangeSelect days={d.days} />
            <button type="button" className="ov-btn primary" onClick={() => setAddOpen(true)}><Plus size={14} /> Add Competitor</button>
          </>
        }
      />

      <IntelStrip c={{
        rank, score, momentum, days: d.days, connected: d.connected,
        threat: autoPick ? { name: autoPick.row.name, leads: autoPick.leads } : null,
        opportunity,
      }} />

      {roster.length ? (
        <Roster you={d.you} rows={roster} ranks={ranks} youRank={youRank} selectedId={active?.id ?? null} onSelect={setSelectedId} connectHref={d.igConnectHref} />
      ) : (
        <div className="ov-empty cx-roster-empty">
          <b>{d.niche ? (d.platform === "all" ? "No competitors found yet" : `No ${d.platform} competitors yet`) : "Set your niche to find competitors"}</b>
          <p>{d.niche ? "Run a discovery refresh so SOCIA searches your niche, or add one by hand." : "SOCIA searches for competitors inside your niche. Choose it in the Niche Trends section below."}</p>
          <div className="cx-empty-actions">
            {d.niche && <RefreshButton className="ov-btn ghost small" label="Refresh discovery" />}
            <button type="button" className="ov-btn primary small" onClick={() => setAddOpen(true)}><Plus size={13} /> Add Competitor</button>
          </div>
        </div>
      )}

      {active && pick ? (
        <>
          <ProfileBar r={active} similarity={pick.similarity} igEnabled={d.ig.enabled} onTrack={track} tracking={tracking === active.id} />

          <div className="cx2-grid main">
            <section className="ov-card cx2-card cx2-traj">
              <div className="cx2-card-head">
                <h2><Activity size={14} /> Performance trajectory</h2>
                <div className="ov-seg cx2-seg" role="tablist" aria-label="Metric">
                  {(["interactions", "views", "followers"] as Metric[]).map((m) => (
                    <button key={m} type="button" role="tab" aria-selected={metric === m} className={metric === m ? "on" : ""} onClick={() => setMetric(m)}>
                      {m === "interactions" ? "Interactions" : m === "views" ? "Views" : "Followers"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="cx2-legend">
                <span><i className="cx2-swatch you round" /> You</span>
                {metric !== "followers" && <span><i className="cx2-swatch them round" /> {themName}</span>}
                <span className="cx2-micro">{metric === "followers" ? "DAILY SNAPSHOTS" : "PER POST, IN RANGE"}</span>
              </div>
              <Trajectory
                you={trajYou} them={trajThem} themName={themName}
                unit={fmtN} animateKey={`${metric}:${active.id}`}
              />
              {trajNote && <small className="cx2-foot">{trajNote}</small>}
            </section>

            <section className="ov-card cx2-card cx2-score">
              <div className="cx2-card-head"><h2>SOCIA performance score</h2></div>
              <div className="cx2-score-body">
                <ScoreRing value={score.overall} />
                <div className="cx2-subscores">
                  {score.components.map((c) => (
                    <div key={c.key} className="cx2-sub" title={c.note}>
                      <span>{c.label}</span>
                      <span className="cx2-sub-track">{c.value != null ? <i style={{ ["--w" as string]: `${c.value}%` }} /> : <i className="absent" />}</span>
                      <b className={c.value != null ? "" : "none"}>{c.value ?? "—"}</b>
                    </div>
                  ))}
                </div>
              </div>
              <small className="cx2-foot">
                {score.overall != null
                  ? `Computed from ${score.basis} of 4 metrics of your real data against published 2026 benchmarks. Hover each for the formula.`
                  : d.connected ? "Fills in as your data syncs — nothing is estimated meanwhile." : <>Connect Instagram to compute your score. <a href={d.igConnectHref} className="ov-link">Connect</a></>}
              </small>
              {radarAxes.length >= 3 && (
                <>
                  <div className="cx2-card-head sub"><h3>Market position</h3><span className="cx2-micro">YOU VS {themName.toUpperCase().slice(0, 18)}</span></div>
                  <Radar axes={radarAxes} themName={themName} />
                </>
              )}
            </section>
          </div>

          <GapBars comparisons={pick.comparisons} themName={themName} connected={d.connected} connectHref={d.igConnectHref} />

          {active.posts.length === 0 ? (
            // Both cards would gate on the identical message — say it once.
            <ContentUnlock r={active} />
          ) : (
            <div className="cx2-grid duo">
              <ContentMix r={active} patterns={patterns} yourTopFormat={d.you?.topFormat ?? null} />
              <WhenTheyPost r={active} />
            </div>
          )}

          {scatterAll.length >= 3 && (
            <section className="ov-card cx2-card cx2-scatter">
              <div className="cx2-card-head">
                <h2>Content performance</h2>
                <div className="ov-seg cx2-seg" role="tablist" aria-label="Format">
                  {scatterFormats.map((f) => (
                    <button key={f} type="button" role="tab" aria-selected={scatterFmt === f} className={scatterFmt === f ? "on" : ""} onClick={() => setScatterFmt(f)}>{f === "All" ? "All" : `${f}s`}</button>
                  ))}
                </div>
              </div>
              <Scatter posts={scatterPosts} yLabel={scatterYLabel} unit={fmtN} />
              <small className="cx2-foot">Each bubble is one of {themName}&apos;s real posts — size is comments. Click one to open it.</small>
            </section>
          )}

          <TopContent r={active} onExamples={(tag, title) => setEvidence({ kind: "examples", tag, title })} />

          <WhyWinning reasons={reasons} r={active} connected={d.connected} onEvidence={(reason) => setEvidence({ kind: "reason", reason })} />

          <NextMove items={learn} themName={active.name} onIdeas={askContext} onExamples={(tag, title) => setEvidence({ kind: "examples", tag, title })} />
        </>
      ) : roster.length ? null : (
        !d.connected && (
          <div className="ov-empty cx-connect"><Link2 size={14} /><b>Connect Instagram to compare your own numbers</b><p>Competitor data still appears without it; the comparison needs your account.</p><a href={d.igConnectHref} className="ov-btn primary small">Connect Instagram</a></div>
        )
      )}

      <NicheSection
        d={d}
        active={active && patterns ? { name: active.name, patterns } : null}
        saved={savedSet} savedItems={savedItems} saving={saving}
        onOpen={setOpenPost} onSave={toggleSave}
      />

      <EvidenceDrawer item={evidence} you={you} them={active} days={d.days} location={d.location} onClose={() => setEvidence(null)} />
      <NicheDrawer post={openPost} saved={openPost ? savedSet.has(openPost.url) : false} saving={openPost ? saving === openPost.url : false} onToggleSave={toggleSave} onClose={() => setOpenPost(null)} />
      <AddCompetitor open={addOpen} onClose={() => setAddOpen(false)} tracked={d.tracked} suggestions={d.rows.filter((r) => !r.tracked)} />
    </div>
  );
}
