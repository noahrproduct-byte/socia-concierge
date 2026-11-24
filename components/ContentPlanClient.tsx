"use client";

import { waitingDayIndexes } from "@/lib/planWaiting";
import EvidenceSplitView from "@/components/plan/EvidenceSplitView";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Compass,
  Target,
  Sparkles,
  CheckCircle2,
  BarChart3,
  Users,
  CalendarCheck2,
  CalendarPlus,
  CalendarDays,
  ArrowRight,
  Clock,
  Activity,
  FileDown,
  Plug,
  Database,
  Trophy,
  PenSquare,
  Plus,
  Clapperboard,
  Film,
  Check,
  X,
  Undo2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { AskDrawer } from "@/components/AskSocia";
import type { AskProposal } from "@/lib/ask";
import type { PlanOutcome, PlanOutcomeSummary, ItemOutcome } from "@/lib/planOutcomes";
import CountUp from "@/components/CountUp";
import BestTime from "@/components/BestTime";
import type { Deliverable, GenerateInput, SavedPlan } from "@/lib/schema";
import {
  buildAudience,
  suggestedHour,
  hourLabel,
  mondayOf,
  DAY_MS,
  audienceWindowsText,
  type CalPost,
} from "@/lib/audience";
import { draftsFromPlan, weekdayIndex } from "@/lib/scheduling";
import { isPlanError, type PlanError } from "@/lib/planErrors";
import type { UsageSnapshot } from "@/lib/entitlements";
import { pricingHref, PLANS, minPlanWithFeature } from "@/lib/plans";
import PlanNotice, { UsageLine } from "@/components/PlanNotice";
import { Button, ButtonLink, IconButton, ReelRefNote } from "@/components/system";
import { DecisionTag, ItemDialog, RejectDialog, RejectedNote } from "@/components/plan/PlanItemControls";
import DrawStoryboard from "@/components/plan/DrawStoryboard";
import StepPlan, { stillBuilding } from "@/components/plan/StepPlan";
import { cleanIdeas, MAX_IDEAS_TEXT } from "@/lib/planIdeas";
import ContentIdeas from "@/components/plan/ContentIdeas";
import { FilmExample, PlanTrack, WeekStrip, beatsLength, builtOn, type StripItem } from "@/components/plan/PostFocus";
import { planStage, postBuilderHref } from "@/lib/planStage";
import { animatedHour, weekdayOf } from "@/lib/animated/day";

// Loaded on demand: the video preview and renderer are large and only needed once someone presses Make it with AI.
const MakeWithAi = dynamic(() => import("@/components/animated/MakeWithAi"), { ssr: false });
const WeekAnimator = dynamic(() => import("@/components/animated/WeekAnimator"), { ssr: false });
import { PlanTaskRow, usePlanTasks } from "@/components/plan/PlanTasks";
import { reasonLabel, wholeSentences } from "@/lib/planItems";
import { Tabs, TabList, Tab, TabPanel } from "@/components/system";
import type { GrowthStrategy } from "@/lib/strategy";
import PlanMixControls, { type MixValue } from "@/components/plan/PlanMixControls";
import PlanCompetitors from "@/components/plan/PlanCompetitors";
import type { PlanCompetitor } from "@/lib/planEvidence";
import type { PlanMix } from "@/lib/planMix";
import { AuditSection, CompetitorSection, OverviewSection, PLAN_SECTIONS, StrategySection, formatLabel, weekOrder, type PlanSectionId } from "@/components/plan/PlanSections";
import FilmingSessions from "@/components/filming/FilmingSessions";

// Server-assembled context: real prefill from the connected account/profile,
// plus the live metrics shown in the preview strip. Nothing here is invented —
// missing values arrive as null and their UI simply doesn't render.
export type PlanContext = {
  prefill: GenerateInput;
  autoNotes: Partial<Record<keyof GenerateInput, string>>;
  /** Saved in the brand's profile: shown, not asked again (change them in Settings). */
  profile: { niche: string | null; goal: string | null; voice: string | null };
  connected: boolean;
  username: string | null;
  syncedAgo: string | null;
  postsAnalyzed: number | null;
  engRate: string | null;
  posts: CalPost[];
  /** What SOCIA will attach to the brief automatically, counted on the server. */
  evidence: { posts: number; competitors: number; winning: number };
  /** The brand's Growth Strategy, for the report's Growth strategy section; null before one is written. */
  strategy: GrowthStrategy | null;
  /** The brand chose "Post animated videos" (Settings): the plan offers Generate animated videos. */
  animatedOn?: boolean;
  /** How many posts of each kind this week starts from: the last plan's mix (lib/planMix.ts). */
  mix: PlanMix;
  /** The plan includes animated videos (its monthly allowance is above zero). */
  animatedAllowed: boolean;
  /** The competitors the plan builds on, from Discover and the Competitors list (lib/planEvidence.ts planCompetitors). */
  competitors: PlanCompetitor[];
  /** Whether this person may add to the Competitors list (owners and admins). */
  canAddCompetitor: boolean;
  /** Whether what the account is about has been confirmed; until it is, the form asks for it. */
  aboutConfirmed?: boolean;
  /** The connected account's profile picture. */
  avatar?: string | null;
};

// Soft guidance limits — counters only, never truncation.
const MAX: Partial<Record<keyof GenerateInput, number>> = {
  goal: 240,
};


/** A line in the sidebar's Research sources: a tick when SOCIA has it, an empty circle when not. */
function Source({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={ok ? "ok" : ""}>
      <span className="cpl-src-dot" aria-hidden>{ok ? <Check size={11} /> : null}</span>
      <span>{children}</span>
      <span className="sr-only">{ok ? "Included" : "Missing"}</span>
    </li>
  );
}

/** A competitor's picture in the folded Competitors row, or its first letter. */
function MiniAvatar({ c }: { c: PlanCompetitor }) {
  const [broken, setBroken] = useState(false);
  const letter = (c.name || c.handle).replace(/^@/, "").charAt(0).toUpperCase();
  if (c.avatar && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={c.avatar} alt="" width={22} height={22} referrerPolicy="no-referrer" onError={() => setBroken(true)} ref={(el) => { if (el && el.complete && el.naturalWidth === 0) setBroken(true); }} />;
  }
  return <span>{letter}</span>;
}

/** The plan left open, so leaving the page and coming back shows it again. */
const OPEN_KEY = "socia.plan.open";
const focusKey = (planId: string) => `socia.plan.focus.${planId}`;

/** `initial` opens with a plan already on screen (the dev lab's fixture). */
export default function ContentPlanClient({ context, canSchedule = true, initial = null }: { context: PlanContext; canSchedule?: boolean; initial?: { data: Deliverable; id: string | null } | null }) {
  const [form, setForm] = useState<GenerateInput>(context.prefill);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<PlanError | null>(null);
  // Known only after a generate response; before that nothing is rendered.
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [result, setResult] = useState<{ data: Deliverable; id: string | null } | null>(initial);
  const [history, setHistory] = useState<SavedPlan[]>([]);
  const [outcomes, setOutcomes] = useState<PlanOutcomeSummary[]>([]);
  // This week's mix, starting from the last plan's (lib/planMix.ts).
  const [mix, setMix] = useState<MixValue>({ onCamera: context.mix.onCamera, animated: context.animatedAllowed ? context.mix.animated : 0 });
  const [addOnCamera, setAddOnCamera] = useState(context.mix.onCamera > 0);
  // The competitors this plan builds on; unticked ones are left out of this plan only.
  const [competitors, setCompetitors] = useState<PlanCompetitor[]>(context.competitors);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  // With a plan open the settings step aside; "New plan" brings them back.
  const [setup, setSetup] = useState(false);
  useEffect(() => {
    if (!result?.id) return;
    try { localStorage.setItem(OPEN_KEY, result.id); } catch { /* storage may be off */ }
  }, [result?.id]);

  // Deep links ("Add to Content Plan" from Dashboard / Analytics insights and
  // content drawers) arrive as ?note= and show as a note on the form, which
  // the person can remove before anything is generated.
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const note = q.get("note");
      if (note) setForm((f) => ({ ...f, recentPosts: f.recentPosts ? `${f.recentPosts}\n${note}` : note }));
      // "Add to my plan" from Discover: the idea goes in Your ideas, so the next plan makes it one of the week's posts.
      const idea = q.get("idea")?.replace(/\s+/g, " ").trim().slice(0, 300);
      if (idea) { setForm((f) => ({ ...f, ideas: f.ideas?.trim() ? `${f.ideas.trim()}\n${idea}` : idea })); setSetup(true); }
      if (note || idea) window.history.replaceState(null, "", "/plan");
    } catch {
      /* no-op */
    }
  }, []);

  useEffect(() => {
    fetch("/api/plans")
      .then((r) => (r.ok ? r.json() : { plans: [] }))
      .then((j) => {
        const plans: SavedPlan[] = j.plans ?? [];
        setHistory(plans); setOutcomes(Array.isArray(j.outcomes) ? j.outcomes : []);
        // Coming back to the page shows the plan that was open (or the newest one), not an empty stage.
        let want: string | null = null;
        try { want = localStorage.getItem(OPEN_KEY); } catch { /* storage may be off */ }
        const open = plans.find((p) => p.id === want) ?? plans[0];
        if (open) setResult((r) => r ?? { data: open.data, id: open.id });
      })
      .catch(() => {});
  }, []);

  function set<K extends keyof GenerateInput>(key: K, value: GenerateInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // "From your connected account" note stays only while the field still holds
  // the prefilled value — once edited, it's the user's text, not SOCIA's.
  function note(key: keyof GenerateInput) {
    const n = context.autoNotes[key];
    if (!n || form[key] !== context.prefill[key] || !form[key]) return null;
    return (
      <small className="cpl-auto">
        <Sparkles size={10} /> {n}
      </small>
    );
  }

  // A plan is built one day at a time (lib/planSteps.ts): starting it writes only the first day's idea.
  async function generate() {
    setLoading(true);
    setError(null);
    setPlanError(null);
    setResult(null);
    try {
      const res = await fetch("/api/plan/steps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Timing is computed here, in the viewer's time zone, from real posts.
        body: JSON.stringify({ action: "start", ...form, ...mix, skipCompetitors: [...skip], audienceWindows: audienceWindowsText(context.posts) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (isPlanError(json)) { setPlanError(json); return; }
        throw new Error((json as { error?: string }).error || "The plan couldn't be started just now. It didn't use up a plan. Try again.");
      }
      const saved = (json as { plan: SavedPlan }).plan;
      if ((json as { usage?: unknown }).usage) setUsage((json as { usage: UsageSnapshot }).usage);
      setResult({ data: saved.data, id: saved.id });
      setHistory((h) => [saved, ...h]);
      setSetup(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "The plan couldn't be started just now. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const onFile = context.evidence;
  const competitorsUsed = competitors.filter((c) => !skip.has(c.handle)).length;
  const total = mix.onCamera + mix.animated;
  // The person's own ideas fill this week's on-camera posts first (lib/planIdeas.ts).
  const ideaCount = cleanIdeas(form.ideas).length;
  const ideasNote = !ideaCount ? null
    : mix.onCamera === 0 ? "Your ideas go into on-camera posts. Add on-camera posts above to use them."
    : ideaCount > mix.onCamera ? `This week has ${mix.onCamera} on-camera post${mix.onCamera === 1 ? "" : "s"}, so the first ${mix.onCamera} idea${mix.onCamera === 1 ? " is" : "s are"} used. Add posts above to fit more.`
    : `${ideaCount} of this week's ${mix.onCamera} on-camera post${mix.onCamera === 1 ? "" : "s"} will be your idea${ideaCount === 1 ? "" : "s"}.`;
  // An animated-led account turns on-camera videos on and off as a whole.
  function toggleOnCamera(on: boolean) {
    setAddOnCamera(on);
    setMix((m) => ({ ...m, onCamera: on ? Math.max(1, context.mix.onCamera || 2) : 0 }));
  }

  return (
    <div className={`cpl${result && !loading && !setup ? " pl-solo" : ""}`}>
      {/* header */}
      <PageHeader
        title="Planner"
        sub="Plan it, film it, edit it, post it."
        status={
          context.connected ? (
            <span className="ov-status">
              <i className="live" />
              Account connected{context.syncedAgo ? ` · Updated ${context.syncedAgo}` : ""} · Uses your posts, competitors and audience
            </span>
          ) : (
            <span className="ov-status">
              <i />
              No account connected · <Link href="/settings">Connect for live data</Link>
            </span>
          )
        }
      />

      {result && !loading && (
        <div className="pl-bar">
          <button type="button" className="ov-btn ghost small" aria-expanded={setup} onClick={() => setSetup((v) => !v)}>
            {setup ? "Hide plan settings" : "New plan and settings"}
          </button>
        </div>
      )}
      <div className="cpl-grid">
        {/* configuration */}
        <section className="cpl-form">
          <div className="cpl-side">
            <h3>Your account</h3>
            <div className="cpl-acct">
              {context.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="cpl-acct-av" src={context.avatar} alt="" width={44} height={44} referrerPolicy="no-referrer" />
              ) : (
                <span className="cpl-acct-av" aria-hidden>{(form.clientHandle || "?").replace(/^@/, "").charAt(0).toUpperCase()}</span>
              )}
              <div className="cpl-acct-id">
                {context.connected ? (
                  <b>{context.username ? `@${context.username}` : form.clientHandle}</b>
                ) : (
                  <input aria-label="Your account or handle" placeholder="@yourhandle or your brand name" value={form.clientHandle} onChange={(e) => set("clientHandle", e.target.value)} />
                )}
                <select aria-label="Platform" className="cpl-acct-plat" value={form.platform} onChange={(e) => set("platform", e.target.value)}>
                  <option>Instagram</option>
                  <option>Facebook</option>
                  <option>TikTok</option>
                  <option>YouTube Shorts</option>
                </select>
              </div>
            </div>
            {context.profile.niche ? (
              <p className="cpl-fixed">
                <Compass size={12} /> <span>{context.profile.niche}</span>
                <Link href="/settings#brand">Change</Link>
              </p>
            ) : (
              <>
                <input aria-label="Your niche" placeholder="Your niche, e.g. Fitness & health" value={form.niche} onChange={(e) => set("niche", e.target.value)} />
                {note("niche")}
              </>
            )}
            {context.aboutConfirmed === false && (
              <p className="cpl-fixed cpl-about-ask">
                <Sparkles size={12} />
                <span>Check what SOCIA knows about your account first, so the plan is about the right things.</span>
                <Link href="/settings#about">Check it</Link>
              </p>
            )}
          </div>

          <div className="cpl-side">
            <h3>This week</h3>
            <PlanMixControls
              start={context.mix}
              animatedAllowed={context.animatedAllowed}
              value={mix}
              onChange={setMix}
              addOnCamera={addOnCamera}
              onAddOnCamera={toggleOnCamera}
            />
          </div>

          <div className="cpl-side">
            <h3><label htmlFor="cpl-ideas">Your ideas</label></h3>
            <p className="cpl-ideas-help" id="cpl-ideas-help">Videos you want to make this week, one per line. Each one becomes a post, and SOCIA plans the rest around them.</p>
            <textarea
              id="cpl-ideas"
              rows={3}
              aria-describedby="cpl-ideas-help"
              placeholder={"e.g. Behind the scenes of our Saturday rush\nHow we make the dough"}
              value={form.ideas ?? ""}
              maxLength={MAX_IDEAS_TEXT}
              onChange={(e) => set("ideas", e.target.value)}
            />
            {ideasNote && <small className="cpl-auto" role="status">{ideasNote}</small>}
          </div>

          <div className="cpl-side">
            <h3>Goal</h3>
            {context.profile.goal ? (
              <p className="cpl-fixed">
                <Target size={12} /> <span>{context.profile.goal}</span>
                <Link href="/settings#growth">Change</Link>
              </p>
            ) : (
              <>
                <input aria-label="Your goal" placeholder="e.g. grow to 50k, drive bookings, sell a course" value={form.goal} maxLength={MAX.goal} onChange={(e) => set("goal", e.target.value)} />
                {note("goal")}
              </>
            )}
          </div>

          <div className="cpl-side">
            <h3>Competitors</h3>
            <details className="cpl-cmp-fold">
              <summary>
                <span className="cpl-cmp-stack" aria-hidden>
                  {competitors.slice(0, 5).map((c) => <MiniAvatar key={c.handle} c={c} />)}
                </span>
                <span>{competitors.length ? `Using ${competitorsUsed} of ${competitors.length}` : "None yet"}</span>
                <span className="cpl-cmp-fold-cta">Choose</span>
              </summary>
              <PlanCompetitors list={competitors} onList={setCompetitors} skip={skip} onSkip={setSkip} canAdd={context.canAddCompetitor} platform={form.platform} />
            </details>
          </div>

          <div className="cpl-side">
            <h3>Research sources</h3>
            <ul className="cpl-sources">
              <Source ok={onFile.posts > 0}>{onFile.posts > 0 ? `${onFile.posts} of your recent posts read` : <>No posts read yet. <Link href="/settings#accounts">Connect Instagram</Link></>}</Source>
              <Source ok={competitorsUsed > 0}>{competitorsUsed > 0 ? `${competitorsUsed} competitor${competitorsUsed === 1 ? "" : "s"} selected` : "No competitors selected"}</Source>
              <Source ok={context.aboutConfirmed !== false}>{context.aboutConfirmed !== false ? "What your account is about, confirmed" : <>What your account is about isn&apos;t confirmed. <Link href="/settings#about">Check it</Link></>}</Source>
              {result?.data.evidenceUsed?.references != null && (
                <Source ok={result.data.evidenceUsed.references > 0}>{`${result.data.evidenceUsed.references} post${result.data.evidenceUsed.references === 1 ? "" : "s"} built on Reels that took off`}</Source>
              )}
            </ul>
          </div>

          {form.recentPosts.trim() && (
            <p className="cpl-fixed cpl-added-note">
              <PenSquare size={12} /> <span>Added note: {form.recentPosts.trim()}</span>
              <button type="button" className="cpl-note-x" onClick={() => set("recentPosts", "")}>Remove</button>
            </p>
          )}

          {usage && (
            <small className="cpl-auto">
              <UsageLine meter="content_plan" used={usage.used} limit={usage.limit} resetsOn={usage.resetsOn} credits={usage.credits} always />
            </small>
          )}
          <button className="cpl-generate" onClick={generate} disabled={loading} type="button">
            {loading ? (
              <>
                <span className="cpl-btn-spin" aria-hidden /> Starting your plan…
              </>
            ) : (
              <>
                <Sparkles size={15} /> Generate my plan
              </>
            )}
          </button>

          {planError && <PlanNotice error={planError} compact />}
          {error && !planError && <div className="cpl-err">{error}</div>}

          {history.length > 0 && (
            <div className="cpl-recent">
              <small className="cpl-sec">Recent plans</small>
              {history.map((h) => (
                <button
                  key={h.id}
                  className="cpl-recent-item"
                  type="button"
                  onClick={() => {
                    setResult({ data: h.data, id: h.id });
                    setError(null);
                  }}
                >
                  <b>{h.client_handle || h.niche || "Untitled plan"}</b>
                  <small>{new Date(h.created_at).toLocaleDateString()}{stillBuilding(h.data) ? ", in progress" : ""}</small>
                  {outcomes.find((o) => o.planId === h.id)?.line && (
                    <span className="cpl-recent-outcome">{outcomes.find((o) => o.planId === h.id)!.line}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* plan stage */}
        <section className="cpl-stage">
          {/* One video at a time, above the week (components/plan/ContentIdeas.tsx). */}
          <ContentIdeas />
          {loading ? (
            <div className="sp-start" role="status"><span className="cpl-btn-spin" aria-hidden /> Writing the first day&apos;s idea</div>
          ) : result?.id && stillBuilding(result.data) ? (
            <StepPlan planId={result.id} data={result.data} onChange={(data) => {
              setResult((r) => (r && r.id === result.id ? { ...r, data } : r));
              setHistory((h) => h.map((p) => (p.id === result.id ? { ...p, data } : p)));
            }} />
          ) : result ? (
            <Report data={result.data} planId={result.id} createdAt={history.find((h) => h.id === result.id)?.created_at ?? null} posts={context.posts} canSchedule={canSchedule} strategy={context.strategy} goal={context.profile.goal} animatedOn={Boolean(context.animatedOn) || result.data.weeklyPlan.some((p) => p.animated)} onUpdate={(data) => setResult((r) => (r ? { ...r, data } : r))} />
          ) : (
            <div className="cpl-empty">
              <div className="cpl-empty-ico">
                <CalendarPlus size={34} />
              </div>
              <h2>Your plan appears here.</h2>
              <p>
                Generate a plan of {total} {total === 1 ? "post" : "posts"} one day at a time: SOCIA suggests each day&apos;s
                video, and you keep it, ask for another or change it before the next.
              </p>

              <div className="cpl-caps">
                <div className="cpl-cap">
                  <span className="cpl-cap-ico blue">
                    <BarChart3 size={16} />
                  </span>
                  <b>Data-backed</b>
                  <small>Uses your performance and niche trends</small>
                </div>
                <div className="cpl-cap">
                  <span className="cpl-cap-ico purple">
                    <Users size={16} />
                  </span>
                  <b>Competitor-aware</b>
                  <small>Finds gaps and opportunities</small>
                </div>
                <div className="cpl-cap">
                  <span className="cpl-cap-ico green">
                    <Target size={16} />
                  </span>
                  <b>Goal-focused</b>
                  <small>{form.goal.trim() ? `Aligned to: ${form.goal.trim()}` : "Weighted toward the goal you set"}</small>
                </div>
                <div className="cpl-cap">
                  <span className="cpl-cap-ico amber">
                    <CalendarCheck2 size={16} />
                  </span>
                  <b>Actionable plan</b>
                  <small>{total} {total === 1 ? "post" : "posts"} with hooks, formats &amp; timing</small>
                </div>
              </div>

              {context.connected ? (
                <div className="cpl-ctx">
                  <div className="cpl-ctx-head">
                    <span className="cpl-ctx-check">
                      <CheckCircle2 size={14} />
                    </span>
                    <span>
                      <b>Built for your account</b>
                      <p>
                        SOCIA analyzes your content, audience, competitors, and trends to build a
                        plan that actually works.
                      </p>
                    </span>
                  </div>
                  <div className="cpl-ctx-stats">
                    {context.postsAnalyzed != null && context.postsAnalyzed > 0 && (
                      <div className="cpl-stat">
                        <BarChart3 size={13} />
                        <b>
                          <CountUp value={String(context.postsAnalyzed)} />
                        </b>
                        <small>Posts analyzed</small>
                      </div>
                    )}
                    {onFile.competitors > 0 && (
                      <div className="cpl-stat">
                        <Users size={13} />
                        <b>{onFile.competitors}</b>
                        <small>Competitors on file</small>
                      </div>
                    )}
                    {onFile.winning > 0 && (
                      <div className="cpl-stat">
                        <Trophy size={13} />
                        <b>{onFile.winning}</b>
                        <small>Winning videos found</small>
                      </div>
                    )}
                    {context.engRate && (
                      <div className="cpl-stat">
                        <Activity size={13} />
                        <b>
                          <CountUp value={context.engRate} />
                        </b>
                        <small>Engagement rate</small>
                      </div>
                    )}
                    {context.posts.length >= 3 && (
                      <div className="cpl-stat">
                        <Clock size={13} />
                        <b><BestTime posts={context.posts} /></b>
                        <small>Best time to post</small>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="cpl-ctx">
                  <div className="cpl-ctx-head">
                    <span className="cpl-ctx-check dim">
                      <Plug size={14} />
                    </span>
                    <span>
                      <b>Ground it in live data</b>
                      <p>
                        Connect your Instagram and SOCIA prefills this page from your real posts
                        and performance.
                      </p>
                    </span>
                  </div>
                  <Link href="/settings" className="cpl-ctx-link">
                    Connect account <ArrowRight size={12} />
                  </Link>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const STATE_LABEL: Record<ItemOutcome["state"], string | null> = {
  unscheduled: null, draft: "Draft on Calendar", scheduled: "Scheduled", publishing: "Publishing", published: "Published", failed: "Failed",
};

/** Where a planned post got to, and how it did once published. */
function OutcomeTags({ o }: { o: ItemOutcome | null }) {
  if (!o || o.state === "unscheduled") return null;
  const label = STATE_LABEL[o.state];
  const when = o.state === "scheduled" && o.scheduledAt ? ` · ${new Date(o.scheduledAt).toLocaleDateString("en-US", { weekday: "short", hour: "numeric" })}` : "";
  const r = o.result;
  const tone = !r ? null : !r.measured ? "wait" : r.multiplier == null ? "flat" : r.multiplier >= 1.2 ? "up" : r.multiplier < 0.8 ? "down" : "flat";
  return (
    <>
      {label && <span className={`cpl-tag state ${o.state}`}>{label}{when}</span>}
      {o.state === "published" && r && (
        o.permalink
          ? <a className={`cpl-tag result ${tone}`} href={o.permalink} target="_blank" rel="noreferrer" title={r.text}>{r.measured ? r.short : "measuring"}</a>
          : <span className={`cpl-tag result ${tone}`} title={r.text}>{r.measured ? r.short : "measuring"}</span>
      )}
    </>
  );
}

function Report({ data, planId, createdAt = null, posts, canSchedule, strategy, goal, animatedOn = false, onUpdate }: { data: Deliverable; planId: string | null; createdAt?: string | null; posts: CalPost[]; canSchedule: boolean; strategy: GrowthStrategy | null; goal: string | null; animatedOn?: boolean; onUpdate: (d: Deliverable) => void }) {
  const [section, setSection] = useState<PlanSectionId>("week");
  const team = usePlanTasks(planId);
  // Times are SOCIA's, from the audience data, never the model's guess. The
  // same rule the Calendar uses, so the two never disagree.
  const aud = useMemo(() => buildAudience(posts), [posts]);
  // Ask SOCIA about this plan: proposals come back as a rewritten day the
  // user applies (saved to the plan when it has an id), never auto-applied.
  const [ask, setAsk] = useState<{ q: string | null; day: string | null } | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const onProposal = async (p: AskProposal) => {
    if (p.kind !== "plan_day" || !data.weeklyPlan?.[p.index]) return false;
    // A new concept: the fields written for the old one (title, direction, production) no longer apply.
    const weeklyPlan = data.weeklyPlan.map((d, i) => (i === p.index ? { ...d, concept: p.proposed.concept, hook: p.proposed.hook, format: p.proposed.format || d.format, rationale: p.proposed.rationale, title: undefined, direction: undefined, production: undefined } : d));
    // The user approved it: apply on screen now, persist best-effort.
    onUpdate({ ...data, weeklyPlan });
    setApplied(p.day); setTimeout(() => setApplied(null), 2000);
    if (planId) {
      try {
        const res = await fetch("/api/plans", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: planId, weeklyPlan }) });
        const j = await res.json().catch(() => ({}));
        setSaveNote(res.ok ? `${p.day} updated and saved to this plan.` : j.error ?? "Applied on screen, but the plan could not be saved.");
      } catch { setSaveNote("Applied on screen, but the plan could not be saved."); }
    } else setSaveNote(`${p.day} updated on screen. Generate or open a saved plan to keep changes.`);
    return true;
  };
  // Per-post decisions, edits and added ideas: applied on screen, saved to the plan.
  const [itemBusy, setItemBusy] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [making, setMaking] = useState<number | null>(null);
  const [animatingWeek, setAnimatingWeek] = useState(false);
  // The post shown in full (its index in the saved plan); the first of the week until one is chosen.
  const [focus, setFocus] = useState(-1);
  // The video left open in this plan is the one shown on the way back.
  useEffect(() => {
    if (!planId) return;
    try { const v = Number(localStorage.getItem(focusKey(planId))); if (Number.isInteger(v) && v >= 0) setFocus(v); } catch { /* storage may be off */ }
  }, [planId]);
  const pickFocus = (i: number) => {
    setFocus(i);
    if (planId) { try { localStorage.setItem(focusKey(planId), String(i)); } catch { /* storage may be off */ } }
  };
  const persist = async (weeklyPlan: Deliverable["weeklyPlan"], ok: string): Promise<boolean> => {
    onUpdate({ ...data, weeklyPlan });
    if (!planId) { setSaveNote("Changed on screen. Generate or open a saved plan to keep changes."); return false; }
    try {
      const res = await fetch("/api/plans", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: planId, weeklyPlan }) });
      const j = await res.json().catch(() => ({}));
      setSaveNote(res.ok ? ok : j.error ?? "Changed on screen, but the plan could not be saved.");
      return res.ok;
    } catch { setSaveNote("Changed on screen, but the plan could not be saved."); return false; }
  };
  const withItem = (i: number, patch: Partial<Deliverable["weeklyPlan"][number]>) => data.weeklyPlan.map((d, j) => (j === i ? { ...d, ...patch } : d));
  // The week a plan is put on: this one until Wednesday, the next one from Thursday (the same rule as "Schedule this week").
  // The week a plan was made for (made Thursday to Sunday, it is the next week's), said by date once that week is over.
  const oldWeek = (() => {
    if (!createdAt) return null;
    const made = new Date(createdAt);
    if (Number.isNaN(made.getTime())) return null;
    const forWeek = new Date(mondayOf(made).getTime() + (made.getDay() === 0 || made.getDay() >= 4 ? 7 : 0) * DAY_MS);
    return forWeek.getTime() < mondayOf(new Date()).getTime() ? forWeek.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
  })();
  const planWeekStart = (now: Date) => new Date(mondayOf(now).getTime() + (now.getDay() === 0 || now.getDay() >= 4 ? 7 : 0) * DAY_MS);
  const reject = async (i: number, reasons: string[], note: string | null, replace: boolean) => {
    const item = data.weeklyPlan[i];
    setRejecting(null);
    await persist(withItem(i, { decision: { status: "rejected", at: new Date().toISOString(), reasons, note } }), `${item.day}'s idea turned down. The next plan takes it into account.`);
    if (replace) {
      const why = [...reasons.map(reasonLabel), note].filter(Boolean).join("; ");
      setAsk({ q: `Give me a different idea for ${item.day}.${why ? ` I turned this one down: ${why}.` : ""}`, day: item.day });
    }
  };
  const undo = async (i: number) => {
    setItemBusy(i);
    try { await persist(withItem(i, { decision: undefined }), `${data.weeklyPlan[i].day} is back in the plan.`); } finally { setItemBusy(null); }
  };
  const saveItem = async (d: { day: string; title?: string; concept: string; hook: string; format: string; platform?: string }) => {
    const target = editing;
    setEditing(null);
    if (target === "new") {
      const added = { ...d, rationale: "", evidence: "", predictedPerformance: "", source: "own" as const };
      await persist([...data.weeklyPlan, added], `Your idea for ${d.day} is in the plan.`);
    } else if (typeof target === "number") {
      const cur = data.weeklyPlan[target];
      // A rewritten idea: the production notes written for the old one no longer apply.
      const changed = d.concept.trim() !== cur.concept.trim();
      await persist(withItem(target, { ...d, ...(changed ? { direction: undefined, production: undefined } : {}) }), `${d.day} saved.`);
    }
  };
  // The person's own word that a video is filmed or edited, saved on the plan; then on to the next place.
  const markMade = async (i: number, step: "filmed" | "edited", go: string) => {
    setItemBusy(i);
    try { await persist(withItem(i, { made: { step, at: new Date().toISOString() } }), `${data.weeklyPlan[i].day} marked ${step}.`); } finally { setItemBusy(null); }
    window.location.assign(go);
  };
  const onCalendar = (i: number) => (itemOutcome(i)?.state ?? "unscheduled") !== "unscheduled";

  // The hour a post goes out on its weekday: the audience's best hour; an animated post a few hours either side of it.
  const hourFor = (item: { animated?: boolean; slot?: 1 | 2 }) => (wd: number) => {
    const best = suggestedHour(aud, (wd + 6) % 7);
    return item.animated ? animatedHour(best, item.slot ?? 1) : best;
  };
  const timeFor = (item: { day: string; animated?: boolean; slot?: 1 | 2 }): string | null => {
    const wd = weekdayIndex(item.day);
    return wd == null ? null : hourLabel(hourFor(item)(wd));
  };
  // One plan item into Create Post: the hook as the first line, the concept
  // under it, both as the plan wrote them. planId only when the plan is saved.
  const createHref = (post: { day: string; concept: string; hook: string }): string => postBuilderHref(planId, post);
  const ev = data.evidenceUsed;
  // Shown Monday first; actions keep each post's index in the saved plan.
  const weekIdx = useMemo(() => (data.weeklyPlan ?? []).map((_, i) => i).sort((a, b) => weekOrder(data.weeklyPlan[a].day) - weekOrder(data.weeklyPlan[b].day) || a - b), [data.weeklyPlan]);
  // What became of this plan: each day's state on the Calendar and, once
  // published, the result against the account's own median. Re-read after
  // "Schedule this week" so the chips update at once.
  const [outcome, setOutcome] = useState<PlanOutcome | null>(null);
  const [outcomeTick, setOutcomeTick] = useState(0);
  useEffect(() => {
    if (!planId) { setOutcome(null); return; }
    let live = true;
    fetch(`/api/plans/${planId}/outcomes`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live) setOutcome(j?.outcome ?? null); })
      .catch(() => { if (live) setOutcome(null); });
    return () => { live = false; };
  }, [planId, outcomeTick]);
  const itemOutcome = (i: number): ItemOutcome | null => outcome?.items[i] ?? null;
  const [sched, setSched] = useState<{ busy: boolean; ok: boolean; msg: string | null; planError: PlanError | null }>({
    busy: false,
    ok: false,
    msg: null,
    planError: null,
  });

  // Days still waiting for a decision: not turned down, not approved, not already on the Calendar.
  // Animated posts go on the Calendar with their video ("Generate animated videos"), not through Approve week.
  const pendingDays = waitingDayIndexes(data.weeklyPlan ?? [], onCalendar).length;
  const anyApproved = (data.weeklyPlan ?? []).some((d) => !d.animated && d.decision?.status === "approved");

  // When a plan day would post if placed now: the same week and audience hour
  // Approve week uses. null when that day has already passed.
  const whenFor = (i: number): string | null => {
    const item = data.weeklyPlan?.[i];
    if (!item) return null;
    const now = new Date();
    const d = draftsFromPlan([item], planWeekStart(now), hourFor(item)).drafts[0];
    return d && new Date(d.scheduled_at).getTime() > now.getTime() ? d.scheduled_at : null;
  };
  // Days already scheduled or posted are not offered for animated videos.
  const animatedSkip = (data.weeklyPlan ?? []).map((_, i) => i).filter((i) => ["scheduled", "publishing", "published"].includes(itemOutcome(i)?.state ?? ""));

  // Approve week: every day not turned down goes on the Calendar as a draft
  // (the same drafts "Schedule this week" made), and each day it placed is
  // recorded as approved on the plan, as one-by-one approval does.
  async function approveWeek() {
    setSched({ busy: true, ok: false, msg: null, planError: null });
    try {
      const now = new Date();
      // Thursday or later (or Sunday): most of this week is gone, use next.
      const nextWeek = now.getDay() === 0 || now.getDay() >= 4;
      const weekStart = new Date(mondayOf(now).getTime() + (nextWeek ? 7 : 0) * DAY_MS);
      // Only days still waiting for a decision: a day turned down never goes
      // on the Calendar, and one already approved or placed is never placed a
      // second time (in a later week, or at a different hour).
      const waiting = waitingDayIndexes(data.weeklyPlan ?? [], onCalendar).map((i) => data.weeklyPlan[i]);
      if (!waiting.length) {
        setSched({ busy: false, ok: true, planError: null, msg: "Every day of this plan is already approved, turned down or on your Calendar." });
        return;
      }
      const { drafts, skipped } = draftsFromPlan(waiting, weekStart, (wd) =>
        suggestedHour(aud, (wd + 6) % 7)
      );
      const usable = drafts.filter((d) => new Date(d.scheduled_at).getTime() > now.getTime());
      if (!usable.length) throw new Error("None of the days still waiting land on a future date this week or next.");
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: usable.map((d) => ({ ...d, plan_id: planId })) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (isPlanError(j)) { setSched({ busy: false, ok: false, msg: null, planError: j }); return; }
        throw new Error(j.error || "Couldn't add the drafts.");
      }
      const n = (j.posts ?? []).length;
      const already = Number(j.skipped ?? 0);
      setOutcomeTick((t) => t + 1);
      const placed = new Set(usable.map((d) => d.plan_day));
      const decided = (data.weeklyPlan ?? []).map((it) => (it.decision || it.animated || !placed.has(it.day) ? it : { ...it, decision: { status: "approved" as const, at: now.toISOString() } }));
      if (planId && await persist(decided, "")) setSaveNote(null);
      const wk = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const notes = [
        skipped.length ? `${skipped.join(", ")} skipped: not a weekday` : null,
        already ? `${already} already on the calendar` : null,
      ].filter(Boolean);
      const noteText = notes.length ? ` (${notes.join("; ")})` : "";
      setSched({
        busy: false,
        ok: true,
        planError: null,
        msg:
          n === 0
            ? `Nothing new to add: this plan's week of ${wk} is already on your Calendar.`
            : canSchedule
              ? `${n} draft${n === 1 ? "" : "s"} added to the week of ${wk}${noteText}. Attach a video to each on the Calendar and they'll post themselves.`
              : `${n} draft${n === 1 ? "" : "s"} saved to the week of ${wk}${noteText}. They stay as drafts on your plan: nothing publishes by itself.`,
      });
    } catch (e) {
      setSched({ busy: false, ok: false, msg: e instanceof Error ? e.message : "Couldn't add the drafts.", planError: null });
    }
  }

  return (
    <div className="cpl-r">
      <div className="cpl-rhead">
        <div>
          <h1>{oldWeek ? `Week of ${oldWeek}` : "This week"}: {data.weeklyPlan?.length ?? 0} video{data.weeklyPlan?.length === 1 ? "" : "s"}</h1>
          <div className="cpl-rsub">
            {[data.clientHandle, data.niche, data.platform].filter(Boolean).join(", ")}
          </div>
          {oldWeek && <p className="cpl-rsub" role="status">This plan was for the week of {oldWeek}. Make this week&apos;s with New plan and settings.</p>}
        </div>
      </div>

      <Tabs value={section} onValueChange={(v) => setSection(v as PlanSectionId)}>
        {/* Every panel stays mounted (hidden when not chosen) so Export as PDF prints the whole plan. */}
        <TabPanel value="overview" keepMounted className="cpl-panel">
          <OverviewSection data={data} onCalendar={outcome?.summary.onCalendar ?? null} onOpen={setSection} />
        </TabPanel>
        <TabPanel value="audit" keepMounted className="cpl-panel">
          <AuditSection data={data} />
        </TabPanel>
        <TabPanel value="competitors" keepMounted className="cpl-panel">
          <CompetitorSection data={data} />
        </TabPanel>
        <TabPanel value="strategy" keepMounted className="cpl-panel">
          <StrategySection data={data} strategy={strategy} goal={goal} />
        </TabPanel>
        <TabPanel value="week" keepMounted className="cpl-panel">
      {/* The latest plan's posts laid out over the person's filming days (lib/filmingPlan.ts). */}
      {data.weeklyPlan?.length > 0 && <FilmingSessions where="plan" />}
      {data.weeklyPlan?.length > 0 && (
        <section className="cpl-rsec">
          <div className="cpl-rsec-head">
            <button type="button" className="ov-btn ghost small" onClick={() => setAsk({ q: null, day: null })}><Sparkles size={12} /> Ask SOCIA about this plan</button>
            <Button
              variant="primary"
              size="sm"
              className="cpl-approve-week"
              onClick={approveWeek}
              busy={sched.busy}
              disabled={sched.busy || sched.ok || pendingDays === 0}
            >
              <CalendarDays size={14} aria-hidden /> {sched.ok || (pendingDays === 0 && anyApproved) ? "Week approved" : pendingDays === 0 ? "Nothing to approve" : "Approve week"}
            </Button>
            {animatedOn && planId && (
              <Button size="sm" onClick={() => setAnimatingWeek(true)} title="SOCIA makes an animated video for each day that suits one; you review them before they're scheduled">
                <Film size={14} aria-hidden /> Generate animated videos
              </Button>
            )}
          </div>
          {sched.planError && <PlanNotice error={sched.planError} compact />}
          {sched.msg && (
            <p className={`cpl-sched-msg${sched.ok ? " ok" : ""}`}>
              {sched.msg}
              {sched.ok && !canSchedule && (
                <>
                  {" "}
                  Scheduling is available on <Link href={pricingHref(minPlanWithFeature("scheduling"))}>{PLANS[minPlanWithFeature("scheduling")].name}</Link>.
                </>
              )}
              {sched.ok && (
                <>
                  {" "}
                  <Link href="/plan/calendar">
                    Open Calendar <ArrowRight size={12} />
                  </Link>
                </>
              )}
            </p>
          )}
          {saveNote && <p className="cpl-sched-msg ok">{saveNote}</p>}
          {data.ideasLeft?.length ? (
            <p className="cpl-sched-msg">
              Not in this plan: {data.ideasLeft.map((t) => `"${t}"`).join(", ")}. {data.ideasLeft.length === 1 ? "It didn't" : "They didn't"} fit this week&apos;s posts. Add {data.ideasLeft.length === 1 ? "it" : "them"} with Add your own idea, or type {data.ideasLeft.length === 1 ? "it" : "them"} in again for next week&apos;s plan.
            </p>
          ) : null}
          {outcome && outcome.summary.onCalendar > 0 && (
            <div className="cpl-outcome" role="status">
              <span><b>{outcome.summary.published} of {outcome.summary.total}</b> posted</span>
              <span><b>{outcome.summary.onCalendar}</b> on the Calendar</span>
              {outcome.summary.best?.result?.multiplier != null && (
                <span>Best: <b>{outcome.summary.best.day}</b> at {outcome.summary.best.result.short}</span>
              )}
              {outcome.summary.published > 0 && outcome.summary.measured === 0 && <small>Results still arriving from the platforms.</small>}
              {outcome.summary.skipped.length > 0 && outcome.summary.skipped.length < outcome.summary.total && (
                <small>Skipped: {outcome.summary.skipped.join(", ")}</small>
              )}
            </div>
          )}
          {weekIdx.length > 0 && (() => {
            // One post at a time: the week as a strip, the chosen post in full below it.
            const i = weekIdx.includes(focus) ? focus : weekIdx[0];
            const post = data.weeklyPlan[i];
            const pos = weekIdx.indexOf(i);
            const when = timeFor(post);
            const length = beatsLength(post.beats);
            const basis = builtOn(post.ref);
            const calState = itemOutcome(i)?.state ?? null;
            const stage = planStage(post, calState);
            const stripItems: StripItem[] = weekIdx.map((k) => {
              const it = data.weeklyPlan[k];
              return {
                index: k,
                day: weekdayOf(it.day).slice(0, 3),
                time: timeFor(it),
                title: it.title ?? it.hook,
                animated: Boolean(it.animated),
                state: it.decision?.status === "rejected" ? "rejected" : it.decision?.status === "approved" ? "approved" : onCalendar(k) ? "calendar" : null,
                stage: planStage(it, itemOutcome(k)?.state),
              };
            });
            return (
              <>
                <WeekStrip items={stripItems} selected={i} onSelect={pickFocus} />
                <article className={`pf-card${applied === post.day ? " applied" : ""}${post.decision?.status === "rejected" ? " pi-rejected" : ""}`} aria-label={`${post.day}: ${post.title ?? post.hook}`}>
                  <div className="pf-chips">
                    <span className="pf-pill"><CalendarDays size={14} aria-hidden /> {weekdayOf(post.day)}{when ? `, ${when}` : ""}{when && !aud.enough ? " (default)" : ""}</span>
                    <span className="pf-pill">{post.animated ? <Film size={14} aria-hidden /> : <Clapperboard size={14} aria-hidden />} {[post.platform, post.animated ? "Animated video" : formatLabel(post.format), length].filter(Boolean).join(", ")}</span>
                    <DecisionTag item={post} />
                    <OutcomeTags o={itemOutcome(i)} />
                    {basis && (post.ref?.url
                      ? <a className="pf-basis" href={post.ref.url} target="_blank" rel="noopener noreferrer" title="Open the Reel this is built on. Its numbers are another account's result, not a prediction">{basis}</a>
                      : <span className="pf-basis" title="From the numbers SOCIA read for that Reel; another account's result, not a prediction">{basis}</span>)}
                  </div>
                  {post.decision?.status !== "rejected" && <PlanTrack stage={stage} />}
                  <h2 className="pf-title">{post.title ?? post.hook}</h2>
                  {post.hook.trim() && (
                    <div className="pf-hook"><b>Hook</b><span>{post.hook}</span></div>
                  )}
                  {/* A filmed post shows a Reel to film from before its beats. */}
                  {!post.animated && <FilmExample r={post.filmRef} filmLike={post.filmRef ? post.filmLike : undefined} direction={post.direction} />}
                  {post.beats?.length ? (
                    <DrawStoryboard beats={post.beats} planId={planId} itemId={post.id} niche={data.niche} canDraw={canSchedule} />
                  ) : post.animated ? (
                    <p className="pf-note">Animated, no filming: SOCIA writes it as a comparison, a counter or words on screen and makes it in this browser. Make it to see every scene before it&apos;s saved.</p>
                  ) : null}

                  {(post.audience || post.cta || post.successMetric) && (
                    <dl className="pl-facts">
                      {post.audience && <div><dt>For</dt><dd>{post.audience}</dd></div>}
                      {post.cta && <div><dt>The ask</dt><dd>{post.cta}</dd></div>}
                      {post.successMetric && <div><dt>Goal</dt><dd>{post.successMetric}</dd></div>}
                    </dl>
                  )}
                  <details className="pl-more">
                    <summary>Why SOCIA picked this</summary>
                    <p className="pf-concept">{post.concept}</p>
                  <Tabs defaultValue="overview" key={i}>
                    <TabList className="pf-tabs" aria-label="About this post">
                      <Tab value="overview">Overview</Tab>
                      {!post.animated && <Tab value="guide">Production guide</Tab>}
                      <Tab value="evidence">Research and evidence</Tab>
                    </TabList>
                    <TabPanel value="overview" className="pf-panel">
                      <dl className="pf-facts">
                        {post.purpose && (<><dt>Purpose</dt><dd>{post.purpose}</dd></>)}
                        {post.audience && (<><dt>For</dt><dd>{post.audience}</dd></>)}
                        {post.rationale.trim() && (<><dt>Why this</dt><dd>{post.rationale}</dd></>)}
                        {post.cta && (<><dt>Call to action</dt><dd>{post.cta}</dd></>)}
                        {post.successMetric && (<><dt>Success measure</dt><dd>{post.successMetric}</dd></>)}
                      </dl>
                      {!post.purpose && !post.audience && !post.rationale.trim() && !post.successMetric && (
                        <p className="pf-note">{post.animated ? "Animated, no filming: SOCIA writes every scene when you make it, and you check them before it's saved." : "This idea has no more detail yet. Edit it to add some."}</p>
                      )}
                    </TabPanel>
                    {!post.animated && (
                      <TabPanel value="guide" className="pf-panel">
                        <dl className="pf-facts">
                          {post.direction && (<><dt>Direction</dt><dd>{wholeSentences(post.direction)}</dd></>)}
                          {post.production ? (<><dt>To make it</dt><dd>{post.production}</dd></>) : formatLabel(post.format) !== post.format.trim() && (<><dt>Production</dt><dd>{post.format}</dd></>)}
                          {post.editing && (<><dt>Editing</dt><dd>{post.editing}</dd></>)}
                        </dl>
                        {planId && post.decision?.status !== "rejected" && (
                          <Link href={`/studio?mode=guide&plan=${planId}&i=${i}`} className="ov-link" title="Hooks, script and shot list for this post">
                            <Clapperboard size={11} /> {post.guide ? "Open its full production guide" : "Write the full guide in Studio"}
                          </Link>
                        )}
                      </TabPanel>
                    )}
                    <TabPanel value="evidence" className="pf-panel">
                      {post.evidenceSplit ? (
                        <EvidenceSplitView split={post.evidenceSplit} own={post.ownPosts} />
                      ) : (
                        <dl className="pf-facts">
                          {post.evidence.trim() && (<><dt>Based on</dt><dd>{post.evidence}</dd></>)}
                          {post.predictedPerformance.trim() && (<><dt>SOCIA&apos;s guess</dt><dd>{post.predictedPerformance} <small>(a guess before posting, not a result)</small></dd></>)}
                        </dl>
                      )}
                      {post.ref && <ReelRefNote r={post.ref} />}
                      {!post.evidence.trim() && !post.ref && <p className="pf-note">{post.animated ? "An animated idea written for your account; it isn't built on a particular Reel." : "No research is attached to this post."}</p>}
                    </TabPanel>
                  </Tabs>

                  </details>

                  <RejectedNote item={post} />
                  {planId && team.state && post.decision?.status !== "rejected" && <PlanTaskRow planId={planId} item={post} state={team.state} reload={team.reload} />}
                  <div className="pf-actions">
                    {post.decision?.status !== "rejected" && (
                      post.animated ? (
                        planId && !onCalendar(i) && (
                          <Button variant="primary" onClick={() => setMaking(i)} title="SOCIA writes this post as an animated video you can edit, then saves it as a draft"><Film size={15} aria-hidden /> Make the video</Button>
                        )
                      ) : stage === 1 ? (
                        <>
                          <Button variant="primary" busy={itemBusy === i} onClick={() => markMade(i, "filmed", planId ? `/studio?mode=edit&plan=${encodeURIComponent(planId)}&i=${i}` : "/studio?mode=edit")} title="Marks it filmed and opens the video editor, where you drop in your clips"><Clapperboard size={15} aria-hidden /> I filmed it. Open the editor</Button>
                          {planId && <ButtonLink href={`/studio?mode=guide&plan=${planId}&i=${i}`} title="Hooks, script and shot list for this video">Filming guide</ButtonLink>}
                        </>
                      ) : stage === 2 ? (
                        <>
                          <Button variant="primary" busy={itemBusy === i} onClick={() => markMade(i, "edited", createHref(post))} title="Marks it edited and opens the post builder with this hook"><Check size={15} aria-hidden /> It&apos;s edited. Build the post</Button>
                          <ButtonLink href={planId ? `/studio?mode=edit&plan=${encodeURIComponent(planId)}&i=${i}` : "/studio?mode=edit"}>Open the editor</ButtonLink>
                        </>
                      ) : stage === 3 ? (
                        <ButtonLink variant="primary" href={createHref(post)} title="Open the post builder with this hook, add the video and pick a day"><CalendarDays size={15} aria-hidden /> Build the post</ButtonLink>
                      ) : (
                        <ButtonLink href="/plan/calendar"><CalendarDays size={15} aria-hidden /> On your Calendar</ButtonLink>
                      )
                    )}
                    {!post.decision && stage < 4 && (
                      <>
                        <Button onClick={() => setEditing(i)}><PenSquare size={14} aria-hidden /> Change the idea</Button>
                        <Button variant="ghost" onClick={() => setRejecting(i)}><X size={14} aria-hidden /> Not doing this one</Button>
                      </>
                    )}
                    {post.decision?.status === "rejected" && <Button variant="ghost" onClick={() => undo(i)} busy={itemBusy === i}><Undo2 size={14} aria-hidden /> Undo</Button>}
                    {post.decision?.status === "approved" && <span className="pi-hint">On the <Link href="/plan/calendar" className="s-link">Calendar</Link> as a draft.</span>}
                    <span className="pf-actions-end">
                      <button type="button" className="ov-link" title={`Ask SOCIA to rework ${post.day}`} onClick={() => setAsk({ q: `Give me a stronger idea for ${post.day}, keeping it easy to make.`, day: post.day })}><Sparkles size={11} /> Improve</button>
                      <IconButton label="Previous post" size="sm" variant="ghost" disabled={pos <= 0} onClick={() => pickFocus(weekIdx[pos - 1])}><ChevronLeft size={16} aria-hidden /></IconButton>
                      <span className="pf-count">{pos + 1} of {weekIdx.length}</span>
                      <IconButton label="Next post" size="sm" variant="ghost" disabled={pos >= weekIdx.length - 1} onClick={() => pickFocus(weekIdx[pos + 1])}><ChevronRight size={16} aria-hidden /></IconButton>
                    </span>
                  </div>
                </article>
              </>
            );
          })()}
          <Button className="pi-add" size="sm" onClick={() => setEditing("new")}><Plus size={13} aria-hidden /> Add your own idea</Button>
          {planId && animatingWeek && (
            <WeekAnimator open onOpenChange={(o) => { if (!o) setAnimatingWeek(false); }} planId={planId} skip={animatedSkip} whenFor={whenFor} canSchedule={canSchedule} onDone={() => setOutcomeTick((t) => t + 1)} />
          )}
          {planId && making != null && data.weeklyPlan[making] && (
            <MakeWithAi key={making} open onOpenChange={(o) => { if (!o) setMaking(null); }} source={{ kind: "plan", planId, index: making, day: data.weeklyPlan[making].day }} />
          )}
          <RejectDialog open={rejecting != null} day={rejecting != null ? data.weeklyPlan[rejecting]?.day ?? "" : ""} onClose={() => setRejecting(null)} onConfirm={(r, n, replace) => rejecting != null && reject(rejecting, r, n, replace)} />
          {editing != null && (
            <ItemDialog
              key={String(editing)}
              open
              item={editing === "new" ? null : data.weeklyPlan[editing]}
              dayLocked={typeof editing === "number" && onCalendar(editing)}
              onClose={() => setEditing(null)}
              onSave={saveItem}
            />
          )}
        </section>
      )}
      {!data.weeklyPlan?.length && <p className="cpl-sec-empty">This plan has no posts for the week.</p>}
        </TabPanel>
        <details className="pl-more">
          <summary>More about this plan</summary>
        <TabList className="cpl-tabs" aria-label="Plan sections">
          {PLAN_SECTIONS.map((t) => (
            <Tab key={t.id} value={t.id}>
              {t.label}
            </Tab>
          ))}
        </TabList>
          <div className="cpl-evidence" title="What this plan was built from">
        <Database size={12} />
        {ev ? (
          <>
            <span>Built from</span>
            <b>{ev.posts > 0 ? `${ev.posts} of your posts` : "no account posts"}</b>
            <b>{ev.competitors > 0 ? `${ev.competitors} competitor${ev.competitors === 1 ? "" : "s"}` : "no competitors on file"}</b>
            <b>{ev.winning > 0 ? `${ev.winning} winning videos` : "no winning content"}</b>
            <b>{ev.windows ? "your audience windows" : "no timing data"}</b>
            {ev.outcomes != null && ev.outcomes > 0 && <b>{`what became of ${ev.outcomes} planned post${ev.outcomes === 1 ? "" : "s"}`}</b>}
            {ev.trends != null && ev.trends > 0 && <b>{`trends from ${ev.trends} recent niche Reel${ev.trends === 1 ? "" : "s"}`}</b>}
          </>
        ) : (
          <span>Built from the brief you typed. No account data was attached to this plan.</span>
        )}
      </div>

        </details>
      </Tabs>

      {ask && (
        <AskDrawer open onClose={() => setAsk(null)} context={{ page: "plan", planId: planId ?? undefined, planDay: ask.day ?? undefined }} contextLabel={ask.day ? `Day: ${ask.day}` : `Plan for ${data.clientHandle}`} initialQuestion={ask.q} onProposal={onProposal} title="Ask SOCIA about this plan" />
      )}
      <div className="cpl-ractions">
        <button className="cpl-export" onClick={() => window.print()} type="button">
          <FileDown size={14} /> Export as PDF
        </button>
      </div>
    </div>
  );
}
