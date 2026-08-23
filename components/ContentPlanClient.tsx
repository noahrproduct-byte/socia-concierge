"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AtSign,
  Compass,
  Target,
  Sparkles,
  Zap,
  CheckCircle2,
  BarChart3,
  Users,
  CalendarCheck2,
  CalendarPlus,
  ArrowRight,
  Clock,
  Activity,
  Grid3x3,
  FileDown,
  Plug,
} from "lucide-react";
import CountUp from "@/components/CountUp";
import type { Deliverable, GenerateInput, SavedPlan } from "@/lib/schema";

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
  bestTime: string | null;
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

function perfTone(p: string): "green" | "amber" | "blue" {
  if (/high/i.test(p)) return "green";
  if (/experiment|test|risk/i.test(p)) return "amber";
  return "blue";
}

export default function ContentPlanClient({ context }: { context: PlanContext }) {
  const [form, setForm] = useState<GenerateInput>(context.prefill);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Deliverable | null>(null);
  const [history, setHistory] = useState<SavedPlan[]>([]);

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
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Something went wrong.");
      setResult(json.data as Deliverable);
      if (json.saved) setHistory((h) => [json.saved as SavedPlan, ...h]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const competitorCount = form.competitors.split("\n").filter((l) => l.trim()).length;

  return (
    <div className="cpl">
      {/* header */}
      <div className="cpl-head">
        <div>
          <small className="cpl-eyebrow">Content Plan</small>
          <h1>Your content plan</h1>
          <p>
            SOCIA builds a weekly plan for your account. Add anything recent to sharpen it, or
            just hit generate.
          </p>
        </div>
        <div className="cpl-badges">
          <div className="cpl-badge">
            <span className="cpl-badge-ico blue">
              <Zap size={14} />
            </span>
            <span className="cpl-badge-meta">
              <b>Powered by AI</b>
              <small>Strategy + performance + competitors</small>
            </span>
          </div>
          {context.connected ? (
            <div className="cpl-badge">
              <span className="cpl-badge-ico green">
                <CheckCircle2 size={14} />
              </span>
              <span className="cpl-badge-meta">
                <b>Account connected</b>
                <small>Live data{context.syncedAgo ? ` · Updated ${context.syncedAgo}` : ""}</small>
              </span>
            </div>
          ) : (
            <Link href="/settings" className="cpl-badge link">
              <span className="cpl-badge-ico dim">
                <Plug size={14} />
              </span>
              <span className="cpl-badge-meta">
                <b>No account connected</b>
                <small>Connect for live data →</small>
              </span>
            </Link>
          )}
        </div>
      </div>

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
            <span>Recent posts &amp; how they did <em>— one per line</em></span>
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

          <label className="cpl-lab">
            <span>Competitors you watch <em>— one per line</em></span>
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
                    setResult(h.data);
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
                Auditing {form.clientHandle.trim() || "your account"} and drafting the week.
                Usually takes 20–40 seconds.
              </p>
              <div className="cpl-load-bar" aria-hidden>
                <span />
              </div>
            </div>
          ) : result ? (
            <Report data={result} />
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
                    {competitorCount > 0 && (
                      <div className="cpl-stat">
                        <Users size={13} />
                        <b>{competitorCount}</b>
                        <small>Competitors listed</small>
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
                    {context.bestTime && (
                      <div className="cpl-stat">
                        <Clock size={13} />
                        <b>{context.bestTime}</b>
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

function Report({ data }: { data: Deliverable }) {
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
          <h3>This week&apos;s plan</h3>
          <div className="cpl-posts">
            {data.weeklyPlan.map((post, i) => (
              <article className="cpl-post" key={i} style={{ animationDelay: `${i * 70}ms` }}>
                <div className="cpl-post-tags">
                  <span className="cpl-tag day">{post.day}</span>
                  <span className="cpl-tag fmt">{post.format}</span>
                  <span className={`cpl-tag perf ${perfTone(post.predictedPerformance)}`}>
                    {post.predictedPerformance}
                  </span>
                </div>
                <div className="cpl-concept">{post.concept}</div>
                <div className="cpl-hook">
                  <b>Hook</b>
                  {post.hook}
                </div>
                <div className="cpl-postmeta">
                  <b>Why this:</b> {post.rationale}
                  <br />
                  <b>Based on:</b> {post.evidence}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="cpl-ractions">
        <button className="cpl-export" onClick={() => window.print()} type="button">
          <FileDown size={14} /> Export as PDF
        </button>
      </div>
    </div>
  );
}
