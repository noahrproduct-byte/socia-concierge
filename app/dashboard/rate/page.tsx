// app/dashboard/rate/page.tsx
//
// Content Rater UI. Plain Tailwind only — no shadcn, no extra packages,
// so it drops into any Next.js + Tailwind project without setup.

"use client";

import { useState } from "react";

type Scorecard = {
  grade: "A" | "B" | "C" | "D" | "F";
  overallScore: number;
  hookScore: number;
  hookAnalysis: string;
  rewrittenHook: string;
  captionScore: number;
  captionAnalysis: string;
  engagementPotential: "Low" | "Medium" | "High" | "Viral Potential";
  engagementReason: string;
  hashtags: string[];
  tips: { title: string; detail: string }[];
};

const POST_TYPES = ["Reel", "Carousel", "Photo", "Story", "TikTok"];

const NICHES = [
  "Restaurant / Food",
  "Fitness",
  "Fashion",
  "Beauty",
  "Travel",
  "Business",
  "Gaming",
  "Lifestyle",
  "Real Estate",
  "Other",
];

const gradeColor = (g: string) =>
  g === "A"
    ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/10"
    : g === "B"
    ? "text-lime-400 border-lime-400/30 bg-lime-400/10"
    : g === "C"
    ? "text-amber-400 border-amber-400/30 bg-amber-400/10"
    : g === "D"
    ? "text-orange-400 border-orange-400/30 bg-orange-400/10"
    : "text-rose-400 border-rose-400/30 bg-rose-400/10";

const potentialColor = (p: string) =>
  p === "Viral Potential"
    ? "bg-violet-500/15 text-violet-300 border-violet-500/30"
    : p === "High"
    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
    : p === "Medium"
    ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
    : "bg-rose-500/15 text-rose-300 border-rose-500/30";

function ScoreBar({ label, score }: { label: string; score: number }) {
  const pct = Math.max(0, Math.min(10, score)) * 10;
  const color =
    score >= 8
      ? "bg-emerald-400"
      : score >= 6
      ? "bg-lime-400"
      : score >= 4
      ? "bg-amber-400"
      : "bg-rose-400";

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm font-medium text-foreground/85">{label}</span>
        <span className="text-sm font-semibold text-foreground">
          {score}
          <span className="text-muted-foreground">/10</span>
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function ContentRaterPage() {
  const [caption, setCaption] = useState("");
  const [postType, setPostType] = useState("Reel");
  const [niche, setNiche] = useState("Restaurant / Food");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Scorecard | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  async function handleRate() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption, postType, niche, platform: "Instagram" }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }

      // The route validates the model output, but a list must always be a
      // list here too so a missing field can never take the page down.
      const card = data as Partial<Scorecard>;
      setResult({ ...(card as Scorecard), tips: Array.isArray(card.tips) ? card.tips : [], hashtags: Array.isArray(card.hashtags) ? card.hashtags : [] });
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function copyHashtags() {
    if (!result?.hashtags.length) return;
    try {
      await navigator.clipboard.writeText(result.hashtags.join(" "));
      setCopyState("copied");
    } catch {
      // Clipboard access can be refused (permissions, insecure context, no focus).
      setCopyState("failed");
    }
    setTimeout(() => setCopyState("idle"), 1500);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight">Content Rater</h1>
          <p className="mt-2 text-muted-foreground">
            Paste your caption before you post it. Get it scored on hook strength,
            caption quality and engagement potential, plus exactly what to fix.
          </p>
        </div>

        {/* Input card */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <label className="block text-sm font-medium text-foreground/85 mb-2">
            Your caption
          </label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={6}
            placeholder="Paste the caption you're about to post…"
            className="w-full resize-y rounded-xl border border-input bg-background px-4 py-3 text-sm
                       text-foreground placeholder:text-muted-foreground outline-none
                       focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
          />
          <div className="mt-1 text-right text-xs text-muted-foreground">
            {caption.length} characters
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-foreground/85 mb-2">
                Post type
              </label>
              <select
                value={postType}
                onChange={(e) => setPostType(e.target.value)}
                className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm
                           text-foreground outline-none focus:border-violet-500"
              >
                {POST_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground/85 mb-2">
                Niche
              </label>
              <select
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm
                           text-foreground outline-none focus:border-violet-500"
              >
                {NICHES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={handleRate}
            disabled={loading || caption.trim().length < 10}
            className="mt-6 w-full rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white
                       transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-muted
                       disabled:text-muted-foreground"
          >
            {loading ? "Analyzing…" : "Rate this post"}
          </button>

          {error && (
            <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {error}
            </div>
          )}
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="mt-6 animate-pulse rounded-2xl border border-border bg-card p-6">
            <div className="h-20 w-20 rounded-full bg-muted" />
            <div className="mt-6 h-3 w-2/3 rounded bg-muted" />
            <div className="mt-3 h-3 w-1/2 rounded bg-muted" />
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div className="mt-6 space-y-4">
            {/* Grade + overall */}
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-6">
                <div
                  className={`flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border-2 text-5xl font-bold ${gradeColor(
                    result.grade
                  )}`}
                >
                  {result.grade}
                </div>
                <div>
                  <div className="text-sm uppercase tracking-wide text-muted-foreground">
                    Overall score
                  </div>
                  <div className="text-4xl font-bold tracking-tight">
                    {result.overallScore}
                    <span className="text-lg text-muted-foreground">/100</span>
                  </div>
                  <span
                    className={`mt-2 inline-block rounded-lg border px-3 py-1 text-xs font-semibold ${potentialColor(
                      result.engagementPotential
                    )}`}
                  >
                    {result.engagementPotential}
                  </span>
                </div>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                {result.engagementReason}
              </p>
            </div>

            {/* Scores */}
            <div className="rounded-2xl border border-border bg-card p-6 space-y-6">
              <div>
                <ScoreBar label="Hook strength" score={result.hookScore} />
                <p className="mt-3 text-sm text-muted-foreground">
                  {result.hookAnalysis}
                </p>
                <div className="mt-3 rounded-xl border border-violet-500/25 bg-violet-500/5 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-violet-400">
                    Try this instead
                  </div>
                  <p className="mt-1.5 text-sm text-foreground">
                    {result.rewrittenHook}
                  </p>
                </div>
              </div>

              <div className="border-t border-border pt-6">
                <ScoreBar label="Caption quality" score={result.captionScore} />
                <p className="mt-3 text-sm text-muted-foreground">
                  {result.captionAnalysis}
                </p>
              </div>
            </div>

            {/* Tips */}
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Fix these before posting
              </h2>
              {!result.tips.length && (
                <p className="mt-4 text-sm text-muted-foreground">The rating came back without specific fixes.</p>
              )}
              <div className="mt-4 space-y-3">
                {result.tips.map((tip, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-border bg-background p-4"
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-xs font-bold text-violet-300">
                        {i + 1}
                      </span>
                      <div>
                        <div className="text-sm font-semibold text-foreground">
                          {tip.title}
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {tip.detail}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Hashtags */}
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Suggested hashtags
                </h2>
                <button
                  onClick={copyHashtags}
                  disabled={!result.hashtags.length}
                  className="rounded-lg border border-input px-3 py-1.5 text-xs font-medium
                             text-foreground/85 transition hover:border-ring hover:text-white
                             disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {copyState === "copied" ? "Copied" : copyState === "failed" ? "Couldn't copy" : "Copy all"}
                </button>
              </div>
              {!result.hashtags.length && (
                <p className="mt-4 text-sm text-muted-foreground">The rating came back without hashtags.</p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {result.hashtags.map((h) => (
                  <span
                    key={h}
                    className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-foreground/85"
                  >
                    {h}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
