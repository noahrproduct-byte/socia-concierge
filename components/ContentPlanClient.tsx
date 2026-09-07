"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AtSign,
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
  Grid3x3,
  FileDown,
  Plug,
  Database,
  Trophy,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { AskDrawer } from "@/components/AskSocia";
import type { AskProposal } from "@/lib/ask";
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

// Server-assembled context: real prefill from the connected account/profile,
// plus the live metrics shown in the preview strip. Nothing here is invented —
// missing values arrive as null and their UI simply doesn't render.
export type PlanContext = {
  prefill: GenerateInput;
  autoNotes: Partial<Record<keyof GenerateInput, string>>;
  connected: boolean;
  username: string | null;
  syncedAgo: string | null;
  postsAnalyzed: number | null;
  engRate: string | null;
  posts: CalPost[];
  /** What SOCIA will attach to the brief automatically, counted on the server. */
  evidence: { posts: number; competitors: number; winning: number };
};

// Soft guidance limits — counters only, never truncation.
const MAX: Partial<Record<keyof GenerateInput, number>> = {
  goal: 240,
  brandVoice: 200,
  recentPosts: 500,
  competitors: 500,
};

function Counter({ value, max }: { value: string; max: number }) {
  return (
    <small className={`cpl-count${value.length > max ? " over" : ""}`}>
      {value.length}/{max}
    </small>
  );
}

// Older plans (and an occasionally wordy model) put production notes in
// `format` and a paragraph in `predictedPerformance`. Tags show a short label;
// the full text still renders, underneath, as its own line.
const FORMAT_LABELS: [RegExp, string][] = [
  [/reel|video|short/i, "Reel"],
  [/carousel|slides?/i, "Carousel"],
  [/stor(y|ies)/i, "Story"],
  [/static|photo|image|single/i, "Static"],
];
function formatLabel(f: string): string {
  const s = f.trim();
  if (s.length <= 14) return s;
  for (const [re, label] of FORMAT_LABELS) if (re.test(s)) return label;
  return s.split(/[,;:.–—(]/)[0].trim().slice(0, 14);
}
function perfLabel(p: string): string {
  const s = p.trim();
  if (s.length <= 28) return s;
  const head = s.split(/[,;:.–—(]/)[0].trim();
  return head.length <= 28 ? head : "See notes";
}

function perfTone(p: string): "green" | "amber" | "blue" {
  if (/high/i.test(p)) return "green";
  if (/experiment|test|risk/i.test(p)) return "amber";
  return "blue";
}

export default function ContentPlanClient({ context }: { context: PlanContext }) {
  const [form, setForm] = useState<GenerateInput>(context.prefill);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ data: Deliverable; id: string | null } | null>(null);
  const [history, setHistory] = useState<SavedPlan[]>([]);

  // Deep links ("Add to Content Plan" from Dashboard / Analytics insights and
  // content drawers) arrive as ?note= and land in the notes field, reviewed
  // by the user before anything is generated.
  useEffect(() => {
    try {
      const note = new URLSearchParams(window.location.search).get("note");
      if (note) {
        setForm((f) => ({ ...f, recentPosts: f.recentPosts ? `${f.recentPosts}\n${note}` : note }));
        window.history.replaceState(null, "", "/tool");
      }
    } catch {
      /* no-op */
    }
  }, []);

  useEffect(() => {
    fetch("/api/plans")
      .then((r) => (r.ok ? r.json() : { plans: [] }))
      .then((j) => setHistory(j.plans ?? []))
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

  async function generate() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Timing is computed here, in the viewer's time zone, from real posts.
        body: JSON.stringify({ ...form, audienceWindows: audienceWindowsText(context.posts) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Something went wrong.");
      setResult({ data: json.data as Deliverable, id: (json.saved as SavedPlan | null)?.id ?? null });
      if (json.saved) setHistory((h) => [json.saved as SavedPlan, ...h]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const competitorCount = form.competitors.split("\n").filter((l) => l.trim()).length;
  const onFile = context.evidence;

  return (
    <div className="cpl">
      {/* header */}
      <PageHeader
        title="Content Plan"
        sub="SOCIA builds a weekly plan for your account. Add anything recent to sharpen it, or just hit generate."
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
        actions={
          <Link href="/calendar" className="ov-btn ghost">
            <CalendarDays size={14} /> Open Calendar
          </Link>
        }
      />

      <div className="cpl-grid">
        {/* configuration */}
        <section className="cpl-form">
          <small className="cpl-sec">Your account</small>

          <label className="cpl-lab">
            <span>
              <AtSign size={12} /> Your account / handle
            </span>
          </label>
          <input
            placeholder="@yourhandle or your brand name"
            value={form.clientHandle}
            onChange={(e) => set("clientHandle", e.target.value)}
          />
          {note("clientHandle")}

          <label className="cpl-lab">
            <span>
              <Compass size={12} /> Your niche
            </span>
          </label>
          <input
            placeholder="e.g. Fitness & health"
            value={form.niche}
            onChange={(e) => set("niche", e.target.value)}
          />
          {note("niche")}
          {!context.prefill.niche && (
            <small className="cpl-tip">
              Tip: <Link href="/onboarding">set your niche</Link> for sharper plans.
            </small>
          )}

          <label className="cpl-lab">
            <span>
              <Grid3x3 size={12} /> Platform
            </span>
          </label>
          <select value={form.platform} onChange={(e) => set("platform", e.target.value)}>
            <option>Instagram</option>
            <option>Facebook</option>
            <option>TikTok</option>
            <option>YouTube Shorts</option>
            <option>LinkedIn</option>
          </select>

          <small className="cpl-sec gap">Sharpen the plan — all optional</small>

          <label className="cpl-lab">
            <span>
              <Target size={12} /> Your goal <em>— optional</em>
            </span>
            <Counter value={form.goal} max={MAX.goal!} />
          </label>
          <input
            placeholder="e.g. grow to 50k, drive bookings, sell a course"
            value={form.goal}
            onChange={(e) => set("goal", e.target.value)}
          />
          {note("goal")}

          <label className="cpl-lab">
            <span>Brand voice / notes <em>— optional</em></span>
            <Counter value={form.brandVoice} max={MAX.brandVoice!} />
          </label>
          <textarea
            rows={3}
            placeholder={"Playful, family-run, a bit cheeky.\nAvoid corporate tone."}
            value={form.brandVoice}
            onChange={(e) => set("brandVoice", e.target.value)}
          />

          <label className="cpl-lab">
            <span>
              {onFile.posts > 0 ? (
                <>Notes on recent posts <em>— optional</em></>
              ) : (
                <>Recent posts &amp; how they did <em>— one per line</em></>
              )}
            </span>
            <Counter value={form.recentPosts} max={MAX.recentPosts!} />
          </label>
          <textarea
            rows={4}
            placeholder={
              "Reel: pizza pull, 12k views, 340 saves\nCarousel: menu update, 900 views\nStatic: staff photo, 400 views, low reach"
            }
            value={form.recentPosts}
            onChange={(e) => set("recentPosts", e.target.value)}
          />
          {note("recentPosts")}
          {onFile.posts > 0 && (
            <small className="cpl-auto">
              <Sparkles size={10} /> SOCIA already includes your last {onFile.posts} posts with their real numbers.
            </small>
          )}

          <label className="cpl-lab">
            <span>
              {onFile.competitors > 0 || onFile.winning > 0 ? (
                <>Other competitors <em>— optional</em></>
              ) : (
                <>Competitors you watch <em>— one per line</em></>
              )}
            </span>
            <Counter value={form.competitors} max={MAX.competitors!} />
          </label>
          <textarea
            rows={3}
            placeholder={
              "@rivalpizza — behind-the-scenes dough Reels doing 50k+\n@trendyslice — POV first-person eating clips, big saves"
            }
            value={form.competitors}
            onChange={(e) => set("competitors", e.target.value)}
          />

          {(onFile.competitors > 0 || onFile.winning > 0) && (
            <small className="cpl-auto">
              <Sparkles size={10} /> SOCIA already includes{" "}
              {onFile.competitors > 0 ? `${onFile.competitors} competitor${onFile.competitors === 1 ? "" : "s"}` : ""}
              {onFile.competitors > 0 && onFile.winning > 0 ? " and " : ""}
              {onFile.winning > 0 ? `${onFile.winning} winning videos` : ""} from your Competitors page.
            </small>
          )}
          <button className="cpl-generate" onClick={generate} disabled={loading} type="button">
            {loading ? (
              <>
                <span className="cpl-btn-spin" aria-hidden /> Building your plan…
              </>
            ) : (
              <>
                <Sparkles size={15} /> Generate my plan
              </>
            )}
          </button>

          {error && <div className="cpl-err">{error}</div>}

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
                  <small>{new Date(h.created_at).toLocaleDateString()}</small>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* plan stage */}
        <section className="cpl-stage">
          {loading ? (
            <div className="cpl-loading">
              <div className="cpl-orb">
                <Sparkles size={26} />
              </div>
              <h2>Building your plan…</h2>
              <p>
                Reading {onFile.posts > 0 ? `your last ${onFile.posts} posts` : "your brief"}
                {onFile.competitors > 0 ? `, ${onFile.competitors} competitors` : ""}
                {onFile.winning > 0 ? ` and ${onFile.winning} winning videos` : ""}, then drafting
                the week. Usually takes one to three minutes.
              </p>
              <div className="cpl-load-bar" aria-hidden>
                <span />
              </div>
            </div>
          ) : result ? (
            <Report data={result.data} planId={result.id} posts={context.posts} onUpdate={(data) => setResult((r) => (r ? { ...r, data } : r))} />
          ) : (
            <div className="cpl-empty">
              <div className="cpl-empty-ico">
                <CalendarPlus size={34} />
              </div>
              <h2>Your plan appears here.</h2>
              <p>
                Hit Generate and you&apos;ll get a personalized 5–7 post plan with score, timing,
                hooks, content ideas, and more.
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
                  <small>5–7 posts with hooks, formats &amp; timing</small>
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
                    {onFile.competitors + competitorCount > 0 && (
                      <div className="cpl-stat">
                        <Users size={13} />
                        <b>{onFile.competitors + competitorCount}</b>
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

function Report({ data, planId, posts, onUpdate }: { data: Deliverable; planId: string | null; posts: CalPost[]; onUpdate: (d: Deliverable) => void }) {
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
    const weeklyPlan = data.weeklyPlan.map((d, i) => (i === p.index ? { ...d, concept: p.proposed.concept, hook: p.proposed.hook, format: p.proposed.format || d.format, rationale: p.proposed.rationale } : d));
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
  const timeFor = (day: string): string | null => {
    const wd = weekdayIndex(day);
    return wd == null ? null : hourLabel(suggestedHour(aud, (wd + 6) % 7));
  };
  const ev = data.evidenceUsed;
  const [sched, setSched] = useState<{ busy: boolean; ok: boolean; msg: string | null }>({
    busy: false,
    ok: false,
    msg: null,
  });

  async function scheduleWeek() {
    setSched({ busy: true, ok: false, msg: null });
    try {
      const now = new Date();
      // Thursday or later (or Sunday): most of this week is gone, use next.
      const nextWeek = now.getDay() === 0 || now.getDay() >= 4;
      const weekStart = new Date(mondayOf(now).getTime() + (nextWeek ? 7 : 0) * DAY_MS);
      const { drafts, skipped } = draftsFromPlan(data.weeklyPlan ?? [], weekStart, (wd) =>
        suggestedHour(aud, (wd + 6) % 7)
      );
      const usable = drafts.filter((d) => new Date(d.scheduled_at).getTime() > now.getTime());
      if (!usable.length) throw new Error("None of the plan's days land on a future date this week or next.");
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: usable.map((d) => ({ ...d, plan_id: planId })) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Couldn't add the drafts.");
      const n = (j.posts ?? []).length;
      const already = Number(j.skipped ?? 0);
      const wk = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const notes = [
        skipped.length ? `${skipped.join(", ")} skipped: not a weekday` : null,
        already ? `${already} already on the calendar` : null,
      ].filter(Boolean);
      setSched({
        busy: false,
        ok: true,
        msg:
          n === 0
            ? `Nothing new to add: this plan's week of ${wk} is already on your Calendar.`
            : `${n} draft${n === 1 ? "" : "s"} added to the week of ${wk}${
                notes.length ? ` (${notes.join("; ")})` : ""
              }. Attach a video to each on the Calendar and they'll post themselves.`,
      });
    } catch (e) {
      setSched({ busy: false, ok: false, msg: e instanceof Error ? e.message : "Couldn't add the drafts." });
    }
  }

  return (
    <div className="cpl-r">
      <div className="cpl-rhead">
        <div>
          <small className="cpl-eyebrow">Content audit &amp; weekly plan</small>
          <h1>{data.clientHandle}</h1>
          <div className="cpl-rsub">
            {data.niche} · {data.platform}
          </div>
        </div>
        <div className="cpl-score">
          <div className="cpl-score-num">
            <CountUp value={String(data.healthScore)} />
          </div>
          <div className="cpl-score-den">/ 100 health</div>
          <div className="cpl-score-bar" aria-hidden>
            <span
              className={data.healthScore >= 70 ? "green" : data.healthScore >= 40 ? "amber" : "red"}
              style={{ width: `${Math.max(0, Math.min(100, data.healthScore))}%` }}
            />
          </div>
        </div>
      </div>

      <div className="cpl-evidence" title="What this plan was built from">
        <Database size={12} />
        {ev ? (
          <>
            <span>Built from</span>
            <b>{ev.posts > 0 ? `${ev.posts} of your posts` : "no account posts"}</b>
            <b>{ev.competitors > 0 ? `${ev.competitors} competitor${ev.competitors === 1 ? "" : "s"}` : "no competitors on file"}</b>
            <b>{ev.winning > 0 ? `${ev.winning} winning videos` : "no winning content"}</b>
            <b>{ev.windows ? "your audience windows" : "no timing data"}</b>
          </>
        ) : (
          <span>Built from the brief you typed. No account data was attached to this plan.</span>
        )}
      </div>

      <section className="cpl-rsec">
        <h3>The diagnosis</h3>
        <p className="cpl-lede">{data.headline}</p>
        <p className="cpl-body">{data.auditSummary}</p>
      </section>

      {data.strengths?.length > 0 && (
        <section className="cpl-rsec">
          <h3>What&apos;s working</h3>
          <div className="cpl-pills">
            {data.strengths.map((s, i) => (
              <span className="cpl-pill" key={i}>
                {s}
              </span>
            ))}
          </div>
        </section>
      )}

      {data.problems?.length > 0 && (
        <section className="cpl-rsec">
          <h3>What&apos;s holding it back</h3>
          {data.problems.map((p, i) => (
            <div className="cpl-item" key={i}>
              <h4>{p.issue}</h4>
              <div className="cpl-item-meta">
                <b>Evidence:</b> {p.evidence}
                <br />
                <b>Impact:</b> {p.impact}
              </div>
            </div>
          ))}
        </section>
      )}

      {data.topFixes?.length > 0 && (
        <section className="cpl-rsec">
          <h3>Top fixes, ranked by impact</h3>
          {data.topFixes.map((f, i) => (
            <div className="cpl-item" key={i}>
              <h4>
                <span className="cpl-rank">{i + 1}</span>
                {f.fix}
              </h4>
              <div className="cpl-item-meta">
                <b>Why:</b> {f.why}
                <br />
                <b>Expected impact:</b> {f.expectedImpact}
              </div>
            </div>
          ))}
        </section>
      )}

      {data.competitorInsights?.length > 0 && (
        <section className="cpl-rsec">
          <h3>Competitor gaps to close</h3>
          {data.competitorInsights.map((c, i) => (
            <div className="cpl-item" key={i}>
              <h4>{c.competitor}</h4>
              <div className="cpl-item-meta">
                <b>What&apos;s working:</b> {c.whatsWorking} ({c.format})
                <br />
                <b>Why it wins:</b> {c.whyItWins}
                <br />
                <b>The gap for you:</b> {c.gap}
              </div>
            </div>
          ))}
        </section>
      )}

      {data.weeklyPlan?.length > 0 && (
        <section className="cpl-rsec">
          <div className="cpl-rsec-head">
            <h3>This week&apos;s plan</h3>
            <button type="button" className="ov-btn ghost small" onClick={() => setAsk({ q: null, day: null })}><Sparkles size={12} /> Ask SOCIA about this plan</button>
          </div>
          {saveNote && <p className="cpl-sched-msg ok">{saveNote}</p>}
          <div className="cpl-posts">
            {data.weeklyPlan.map((post, i) => (
              <article className={`cpl-post${applied === post.day ? " applied" : ""}`} key={i} style={{ animationDelay: `${i * 70}ms` }}>
                <div className="cpl-post-tags">
                  <span className="cpl-tag day">{post.day}</span>
                  <button type="button" className="cpl-improve" title={`Ask SOCIA to rework ${post.day}`} onClick={() => setAsk({ q: `Give me a stronger idea for ${post.day}, keeping it easy to film.`, day: post.day })}><Sparkles size={11} /> Improve</button>
                  {timeFor(post.day) && (
                    <span className="cpl-tag time" title={aud.enough ? "From your audience's engagement windows" : "No audience data yet; noon by default"}>
                      <Clock size={10} /> {timeFor(post.day)}
                    </span>
                  )}
                  <span className="cpl-tag fmt">{formatLabel(post.format)}</span>
                  <span className={`cpl-tag perf ${perfTone(post.predictedPerformance)}`}>
                    {perfLabel(post.predictedPerformance)}
                  </span>
                </div>
                <div className="cpl-concept">{post.concept}</div>
                <div className="cpl-hook">
                  <b>Hook</b>
                  {post.hook}
                </div>
                <div className="cpl-postmeta">
                  {formatLabel(post.format) !== post.format.trim() && (
                    <>
                      <b>Production:</b> {post.format}
                      <br />
                    </>
                  )}
                  {perfLabel(post.predictedPerformance) !== post.predictedPerformance.trim() && (
                    <>
                      <b>Expected:</b> {post.predictedPerformance}
                      <br />
                    </>
                  )}
                  <b>Why this:</b> {post.rationale}
                  <br />
                  <b>Based on:</b> {post.evidence}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {ask && (
        <AskDrawer open onClose={() => setAsk(null)} context={{ page: "plan", planId: planId ?? undefined, planDay: ask.day ?? undefined }} contextLabel={ask.day ? `Day: ${ask.day}` : `Plan for ${data.clientHandle}`} initialQuestion={ask.q} onProposal={onProposal} title="Ask SOCIA about this plan" />
      )}
      <div className="cpl-ractions">
        <button className="cpl-export" onClick={() => window.print()} type="button">
          <FileDown size={14} /> Export as PDF
        </button>
        {data.weeklyPlan?.length > 0 && (
          <button
            className="cpl-schedule"
            onClick={scheduleWeek}
            disabled={sched.busy || sched.ok}
            type="button"
            title="Creates a calendar draft for each day of the plan at your audience's hour"
          >
            <CalendarDays size={14} />{" "}
            {sched.busy ? "Adding to Calendar…" : sched.ok ? "Added to Calendar" : "Schedule this week"}
          </button>
        )}
      </div>
      {sched.msg && (
        <p className={`cpl-sched-msg${sched.ok ? " ok" : ""}`}>
          {sched.msg}
          {sched.ok && (
            <>
              {" "}
              <Link href="/calendar">
                Open Calendar <ArrowRight size={12} />
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}
