"use client";

// What the Content Plan page shows while a plan is being built: each step as
// the server reports it (lib/planProgress.ts), the real time so far, and how
// long this account's plans usually take. Nothing here moves on a timer: a
// step is done only when the server says so.
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import type { PlanStep } from "@/lib/planProgress";

export type BuildState = {
  startedAt: number;
  steps: Partial<Record<PlanStep, "active" | "done">>;
  found: { competitors: number; reels: number; posts: number } | null;
  posts: { started: number; total: number; firstAt: number } | null;
  /** Whether the server is reporting steps at all (an older server answers in one go). */
  live: boolean;
};

export const newBuild = (): BuildState => ({ startedAt: Date.now(), steps: {}, found: null, posts: null, live: false });

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
function about(s: number): string {
  if (s < 60) return `${Math.max(10, Math.round(s / 10) * 10)} seconds`;
  const m = Math.round(s / 60);
  return `${m} minute${m === 1 ? "" : "s"}`;
}

export default function PlanBuilding({ build, onCamera, animated, typical }: { build: BuildState; onCamera: number; animated: number; typical: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsed = Math.max(0, (now - build.startedAt) / 1000);
  const f = build.found;
  const p = build.posts;

  const ideasDetail = !f
    ? null
    : f.reels > 0
      ? `Found ${f.reels} Reel${f.reels === 1 ? "" : "s"} that took off${f.competitors ? ` across ${f.competitors} competitor${f.competitors === 1 ? "" : "s"}` : ""}${f.posts ? `, and read your last ${f.posts} posts` : ""}.`
      : f.competitors > 0
        ? `Read ${f.competitors} competitor${f.competitors === 1 ? "" : "s"}; no new Reels to build on this week, so the plan uses your niche's trends.`
        : "No competitors on file, so the plan uses your niche's trends.";

  // Time left on the filmed posts, from how fast the ones before went (needs two started).
  let left: string | null = null;
  if (p && p.started >= 2 && build.steps.posts === "active") {
    const per = (now - p.firstAt) / 1000 / (p.started - 1);
    const remaining = per * (p.total - p.started + 1);
    if (remaining > 5) left = `About ${about(remaining)} left on these posts.`;
  }

  const rows: { id: PlanStep; label: string; detail: string | null; show: boolean }[] = [
    { id: "ideas", label: "Getting ideas from your competitors and Reels in your niche", detail: ideasDetail, show: true },
    { id: "fit", label: "Making those ideas fit your channel", detail: null, show: true },
    { id: "posts", label: p && build.steps.posts === "active" ? `Writing post ${p.started} of ${p.total}` : `Writing your ${onCamera} on-camera post${onCamera === 1 ? "" : "s"}`, detail: left, show: onCamera > 0 },
    { id: "animated", label: `Adding ${animated} animated video${animated === 1 ? "" : "s"}`, detail: null, show: animated > 0 },
    { id: "saving", label: "Saving your plan", detail: null, show: true },
  ];

  return (
    <div className="cpl-build" aria-busy="true">
      <h2>Building your plan</h2>
      <p className="cpl-build-time">
        <span className="cpl-build-clock">{mmss(elapsed)}</span>{" "}
        {typical ? `Your plans usually take about ${about(typical)}.` : "Usually takes one to three minutes."}
      </p>
      {build.live ? (
        <ol className="cpl-build-steps">
          {rows.filter((r) => r.show).map((r) => {
            const st = build.steps[r.id];
            return (
              <li key={r.id} className={`cpl-build-step ${st ?? "waiting"}`} aria-current={st === "active" ? "step" : undefined}>
                <span className={`cpl-build-dot${st === "active" ? " cpl-btn-spin" : ""}`} aria-hidden>{st === "done" ? <Check size={12} /> : null}</span>
                <span className="cpl-build-text">
                  <b>{r.label}</b>
                  {r.detail && (st === "done" || r.id === "posts") && <small>{r.detail}</small>}
                </span>
                <span className="sr-only">{st === "done" ? "Done" : st === "active" ? "In progress" : "Waiting"}</span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="cpl-build-wait">Connecting…</p>
      )}
    </div>
  );
}
