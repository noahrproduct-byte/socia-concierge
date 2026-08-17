"use client";

import { useState, useEffect } from "react";
import type { Deliverable, GenerateInput, SavedPlan } from "@/lib/schema";

const EMPTY: GenerateInput = {
  clientHandle: "",
  niche: "",
  platform: "Instagram",
  brandVoice: "",
  recentPosts: "",
  competitors: "",
  goal: "",
};

export default function Home() {
  const [form, setForm] = useState<GenerateInput>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Deliverable | null>(null);
  const [history, setHistory] = useState<SavedPlan[]>([]);

  // Load this user's saved plans on mount.
  useEffect(() => {
    fetch("/api/plans")
      .then((r) => (r.ok ? r.json() : { plans: [] }))
      .then((j) => setHistory(j.plans ?? []))
      .catch(() => {});
  }, []);

  function set<K extends keyof GenerateInput>(key: K, value: GenerateInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
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

  return (
    <>
      <header className="top">
        <div className="topin">
          <div className="logo">S</div>
          <div className="brand">
            SOCIA<span>Concierge Engine · internal</span>
          </div>
        </div>
      </header>

      <div className="wrap">
        <div className="grid">
          <div className="panel">
            <h2>New client plan</h2>
            <p className="hint">
              Paste what you know about the account. The more real data, the
              sharper the plan.
            </p>

            <label>Client handle</label>
            <input
              placeholder="@joes.pizza.austin"
              value={form.clientHandle}
              onChange={(e) => set("clientHandle", e.target.value)}
            />

            <label>Niche / vertical</label>
            <input
              placeholder="Neighbourhood pizza restaurant"
              value={form.niche}
              onChange={(e) => set("niche", e.target.value)}
            />

            <label>Platform</label>
            <select
              value={form.platform}
              onChange={(e) => set("platform", e.target.value)}
            >
              <option>Instagram</option>
              <option>TikTok</option>
              <option>YouTube Shorts</option>
              <option>LinkedIn</option>
            </select>

            <label>
              Client goal <span className="opt">— optional</span>
            </label>
            <input
              placeholder="Fill more tables Tue–Thu"
              value={form.goal}
              onChange={(e) => set("goal", e.target.value)}
            />

            <label>
              Brand voice / notes <span className="opt">— optional</span>
            </label>
            <textarea
              placeholder="Playful, family-run, a bit cheeky. Avoid corporate tone."
              value={form.brandVoice}
              onChange={(e) => set("brandVoice", e.target.value)}
            />

            <label>
              Recent posts &amp; how they did{" "}
              <span className="opt">— one per line</span>
            </label>
            <textarea
              placeholder={
                "Reel: pizza pull, 12k views, 340 saves\nCarousel: menu update, 900 views\nStatic: staff photo, 400 views, low reach"
              }
              value={form.recentPosts}
              onChange={(e) => set("recentPosts", e.target.value)}
            />

            <label>
              Competitors &amp; what&apos;s working{" "}
              <span className="opt">— one per line</span>
            </label>
            <textarea
              placeholder={
                "@rivalpizza — behind-the-scenes dough Reels doing 50k+\n@trendyslice — POV first-person eating clips, big saves"
              }
              value={form.competitors}
              onChange={(e) => set("competitors", e.target.value)}
            />

            <button className="btn" onClick={generate} disabled={loading}>
              {loading ? "Analyzing…" : "Generate plan"}
            </button>

            {error && <div className="err">{error}</div>}

            {history.length > 0 && (
              <div className="recent">
                <div className="recent-head">Recent plans</div>
                {history.map((h) => (
                  <button
                    key={h.id}
                    className="recent-item"
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
          </div>

          <div className="report">
            {loading ? (
              <div className="loading">
                <div>
                  <div className="spinner" />
                  Auditing the account and building the week&apos;s plan…
                  <br />
                  <span style={{ fontSize: 12 }}>
                    Opus 5 is thinking — this takes ~20–40s.
                  </span>
                </div>
              </div>
            ) : result ? (
              <Report data={result} />
            ) : (
              <div className="empty">
                <div>
                  <div className="big">Your deliverable appears here.</div>
                  Fill in the brief and hit Generate. You&apos;ll get a health
                  score, an honest audit, competitor gaps, and a 5–7 post plan
                  you can send straight to the client.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Report({ data }: { data: Deliverable }) {
  return (
    <>
      <div className="rhead">
        <div className="rmeta">
          <div className="eyebrow">Content Audit &amp; Weekly Plan</div>
          <h1>{data.clientHandle}</h1>
          <div className="sub">
            {data.niche} · {data.platform}
          </div>
        </div>
        <div className="score">
          <div className="num">{data.healthScore}</div>
          <div className="den">/ 100 health</div>
        </div>
      </div>

      <section className="block">
        <h3>The diagnosis</h3>
        <p className="lede">
          <strong>{data.headline}</strong>
        </p>
        <p style={{ marginTop: 8, color: "var(--slate)" }}>{data.auditSummary}</p>
      </section>

      {data.strengths?.length > 0 && (
        <section className="block">
          <h3>What&apos;s working</h3>
          <div className="pills">
            {data.strengths.map((s, i) => (
              <span className="pill" key={i}>
                {s}
              </span>
            ))}
          </div>
        </section>
      )}

      {data.problems?.length > 0 && (
        <section className="block">
          <h3>What&apos;s holding it back</h3>
          {data.problems.map((p, i) => (
            <div className="item" key={i}>
              <h4>{p.issue}</h4>
              <div className="meta">
                <b>Evidence:</b> {p.evidence}
                <br />
                <b>Impact:</b> {p.impact}
              </div>
            </div>
          ))}
        </section>
      )}

      {data.topFixes?.length > 0 && (
        <section className="block">
          <h3>Top fixes, ranked by impact</h3>
          {data.topFixes.map((f, i) => (
            <div className="item fix" key={i}>
              <h4>
                <span className="rank">{i + 1}</span>
                {f.fix}
              </h4>
              <div className="meta">
                <b>Why:</b> {f.why}
                <br />
                <b>Expected impact:</b> {f.expectedImpact}
              </div>
            </div>
          ))}
        </section>
      )}

      {data.competitorInsights?.length > 0 && (
        <section className="block">
          <h3>Competitor gaps to close</h3>
          {data.competitorInsights.map((c, i) => (
            <div className="item" key={i}>
              <h4>{c.competitor}</h4>
              <div className="meta">
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
        <section className="block">
          <h3>This week&apos;s plan</h3>
          <div className="plan">
            {data.weeklyPlan.map((post, i) => (
              <div className="post" key={i}>
                <div className="row1">
                  <span className="tag">{post.day}</span>
                  <span className="tag fmt">{post.format}</span>
                  <span className="tag perf">{post.predictedPerformance}</span>
                </div>
                <div className="concept">{post.concept}</div>
                <div className="hook">
                  <b>Hook</b>
                  {post.hook}
                </div>
                <div className="why">
                  <b>Why this:</b> {post.rationale}
                  <br />
                  <b>Based on:</b> {post.evidence}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="actions">
        <button className="btn" onClick={() => window.print()}>
          Export as PDF
        </button>
      </div>
    </>
  );
}
