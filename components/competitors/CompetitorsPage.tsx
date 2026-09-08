"use client";

// Competitors: who to study → why they're ahead → their patterns → what to
// learn → what wins across the niche → what's trending → what to create.
// Selection is client state; every section below the roster re-derives from
// the selected competitor without a reload.

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Link2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { askSocia } from "@/lib/ask";
import { absent, type LeaderRow } from "@/lib/competitorRollup";
import { compareRows, leadsOn, pickMostSimilar, similarity, type SimilarPick } from "@/lib/similarCompetitor";
import { groupedPatterns, learnings, reasonsFor, type CompetitorRow, type Reason } from "@/lib/competitorIntel";
import type { NichePost } from "@/lib/nicheTrends";
import type { CompetitorsData } from "./types";
import { PlatformSelect, RangeSelect, RefreshButton } from "./Controls";
import Roster from "./Roster";
import { Comparison, ProfileCard, Reasons } from "./SelectedCompetitor";
import { Learn, Patterns, Themes } from "./PatternsRow";
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

export default function CompetitorsPage({ d }: { d: CompetitorsData }) {
  const router = useRouter();
  const now = useMemo(() => new Date(d.now), [d.now]);
  const you = d.you ?? placeholderYou();
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  return (
    <div className="cx">
      <PageHeader
        title="Competitors"
        sub="See who's outperforming you, what they're doing differently, and turn their success into your next move."
        status={
          <span className="ov-status cx-status">
            <i className={d.lastRun ? "live" : ""} />
            {d.lastRun ? <>Live competitor intelligence · refreshed {agoText(d.lastRun, now)}</> : <>No discovery run yet</>}
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

      {roster.length ? (
        <Roster you={d.you} rows={roster} selectedId={active?.id ?? null} onSelect={setSelectedId} connectHref={d.igConnectHref} />
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
          <div className="cx-row cx-row-top">
            <ProfileCard r={active} location={d.location} igEnabled={d.ig.enabled} onTrack={track} tracking={tracking === active.id} similarity={pick.similarity} />
            <Comparison r={active} you={you} comparisons={pick.comparisons} days={d.days} connected={d.connected} connectHref={d.igConnectHref} />
            <Reasons reasons={reasons} r={active} connected={d.connected} onEvidence={(reason) => setEvidence({ kind: "reason", reason })} />
          </div>
          <div className="cx-row cx-row-mid">
            <Patterns r={active} patterns={patterns} />
            <Themes r={active} patterns={patterns} />
            <Learn r={active} items={learn} onIdeas={askContext} onExamples={(tag, title) => setEvidence({ kind: "examples", tag, title })} />
          </div>
        </>
      ) : roster.length ? null : (
        !d.connected && (
          <div className="ov-empty cx-connect"><Link2 size={14} /><b>Connect Instagram to compare your own numbers</b><p>Competitor data still appears without it; the comparison column needs your account.</p><Link href={d.igConnectHref} className="ov-btn primary small">Connect Instagram</Link></div>
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
