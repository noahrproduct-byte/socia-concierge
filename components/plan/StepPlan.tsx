"use client";

// The week's plan, one day at a time (lib/planSteps.ts): the days and where each stands, the idea waiting for
// a decision with Accept and continue, Try another and Edit, and the person's earlier ideas for that day.
// Accepted days get their full post written in the background; this view reads the plan again until they
// are in, then the page shows the finished plan.
import { useEffect, useRef, useState } from "react";
import { Check, Film, Clapperboard, Pencil, RefreshCw, AlertCircle } from "lucide-react";
import type { BuildSlot, Deliverable, IdeaCard } from "@/lib/schema";
import { TRIES_PER_DAY, progress, reviewingIndex } from "@/lib/planSteps";
import { Button } from "@/components/system";
import "./plan-flow.css";

const POLL_MS = 4000;

type Step = { action: string; day?: number; idea?: Partial<IdeaCard>; earlier?: number };

async function send(planId: string, body: Step): Promise<Deliverable> {
  const res = await fetch("/api/plan/steps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: planId, ...body }) });
  const j = (await res.json().catch(() => ({}))) as { plan?: { data: Deliverable }; error?: string };
  if (!res.ok || !j.plan) throw new Error(j.error || "SOCIA hit an error on its side. Try again in a moment.");
  return j.plan.data;
}

/** Whether the plan is still being made, so the page shows this view rather than the finished plan. Pure. */
export function stillBuilding(d: Deliverable | null | undefined): boolean {
  const b = d?.build;
  if (!b) return false;
  return b.status === "building" || b.audit === "writing" || (b.status === "done" && !b.audit);
}

function stateLabel(s: BuildSlot): string {
  if (s.state === "done") return "Approved";
  if (s.state === "writing") return "Approved, writing the post";
  if (s.state === "reviewing") return "Your call";
  if (s.state === "failed") return "Post not written";
  return "Not yet";
}

export default function StepPlan({ planId, data, onChange }: { planId: string; data: Deliverable; onChange: (d: Deliverable) => void }) {
  const build = data.build!;
  const at = reviewingIndex(build);
  const slot = at >= 0 ? build.slots[at] : null;
  const { approved, total } = progress(build);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<IdeaCard | null>(null);
  const keep = useRef(onChange);
  keep.current = onChange;

  // Accepted days are written in the background: read the plan again until they (and the week's read) are in.
  const waiting = build.slots.some((s) => s.state === "writing") || build.audit === "writing" || (build.status === "done" && !build.audit);
  useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/plan/steps?plan=${encodeURIComponent(planId)}`);
        const j = (await res.json().catch(() => ({}))) as { plan?: { data: Deliverable } };
        if (res.ok && j.plan) keep.current(j.plan.data);
      } catch { /* the next look tries again */ }
    }, POLL_MS);
    return () => clearTimeout(t);
  }, [waiting, data, planId]);

  useEffect(() => { setEditing(null); setError(null); }, [at]);

  const step = async (name: string, body: Step) => {
    setBusy(name); setError(null);
    try {
      keep.current(await send(planId, body));
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const triesLeft = slot ? Math.max(0, TRIES_PER_DAY - slot.tries) : 0;
  const failed = build.slots.map((s, i) => ({ s, i })).filter(({ s }) => s.state === "failed");

  return (
    <section className="sp" aria-label="This week's plan, one day at a time">
      <header className="sp-head">
        <h2>Plan the week, one day at a time</h2>
        <p>{approved} of {total} {total === 1 ? "day" : "days"} approved. SOCIA writes the full post for each day you keep.</p>
      </header>

      <ol className="sp-days">
        {build.slots.map((s, i) => (
          <li key={s.key} className={`sp-day is-${s.state}${i === at ? " is-now" : ""}`}>
            <span className="sp-day-ico" aria-hidden>
              {s.state === "done" || s.state === "writing" ? <Check size={13} /> : s.state === "failed" ? <AlertCircle size={13} /> : s.kind === "animated" ? <Film size={13} /> : <Clapperboard size={13} />}
            </span>
            <span className="sp-day-name">{s.key}</span>
            <span className="sp-day-title">{s.idea && s.state !== "reviewing" ? s.idea.title : ""}</span>
            <span className="sp-day-state">{stateLabel(s)}</span>
          </li>
        ))}
      </ol>

      {slot?.idea && (
        <article className="sp-card" aria-live="polite">
          <p className="sp-card-day">{slot.key}, {slot.kind === "animated" ? "animated video (no filming)" : "a video you film"}</p>
          {editing ? (
            <form className="sp-edit" onSubmit={(e) => { e.preventDefault(); void step("accept", { action: "accept", day: at, idea: editing }); }}>
              <label>Title<input value={editing.title} maxLength={80} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></label>
              <label>What it shows<textarea rows={3} value={editing.description} maxLength={280} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></label>
              <span className="sp-edit-row">
                <label>Format<input value={editing.format} maxLength={60} onChange={(e) => setEditing({ ...editing, format: e.target.value })} /></label>
                <label>Pillar<input value={editing.pillar} maxLength={40} onChange={(e) => setEditing({ ...editing, pillar: e.target.value })} /></label>
              </span>
              <span className="sp-actions">
                <Button type="submit" variant="primary" busy={busy === "accept"} disabled={busy != null || !editing.title.trim()}>Save and continue</Button>
                <Button variant="ghost" disabled={busy != null} onClick={() => setEditing(null)}>Cancel</Button>
              </span>
            </form>
          ) : (
            <>
              <h3 className="sp-card-title">{slot.idea.title}</h3>
              {slot.idea.hook && <p className="sp-card-hook">&ldquo;{slot.idea.hook}&rdquo;</p>}
              <p className="sp-card-desc">{slot.idea.description}</p>
              <p className="sp-card-meta">
                <span>{slot.idea.format}</span>
                {slot.idea.pillar && <span>{slot.idea.pillar}</span>}
                {slot.idea.fromIdea ? <span>Your idea</span> : null}
              </p>
              <span className="sp-actions">
                <Button variant="primary" busy={busy === "accept"} disabled={busy != null} onClick={() => step("accept", { action: "accept", day: at })}>
                  <Check size={14} aria-hidden /> {build.slots.some((s, i) => i !== at && s.state === "waiting") ? "Accept and continue" : "Accept, last day"}
                </Button>
                <Button busy={busy === "retry"} disabled={busy != null || triesLeft === 0} onClick={() => step("retry", { action: "retry", day: at })} title={triesLeft === 0 ? "You've used the other ideas for this day. Pick an earlier one or edit this one." : undefined}>
                  <RefreshCw size={14} aria-hidden /> Try another ({triesLeft} left)
                </Button>
                <Button variant="ghost" disabled={busy != null} onClick={() => setEditing({ ...slot.idea! })}>
                  <Pencil size={14} aria-hidden /> Edit
                </Button>
              </span>
              {busy === "accept" && <p className="sp-note" role="status">Saving this day and writing the next idea.</p>}
              {busy === "retry" && <p className="sp-note" role="status">Writing another idea for {slot.key}.</p>}
            </>
          )}
          {slot.earlier.length > 0 && !editing && (
            <details className="sp-earlier">
              <summary>Earlier ideas for {slot.key} ({slot.earlier.length})</summary>
              <ul>
                {slot.earlier.map((e, k) => (
                  <li key={k}>
                    <span><b>{e.title}</b> {e.description}</span>
                    <Button size="sm" variant="ghost" disabled={busy != null} onClick={() => step("earlier", { action: "earlier", day: at, earlier: k })}>Use this one</Button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </article>
      )}

      {!slot && waiting && <p className="sp-note" role="status">{build.slots.some((s) => s.state === "writing") ? "Writing the posts you approved. The finished plan opens here when they're done." : "Writing the week's summary."}</p>}
      {failed.map(({ s, i }) => (
        <p key={s.key} className="sp-fail" role="alert">
          {s.key}: {s.error ?? "SOCIA couldn't write this post."}{" "}
          <Button size="sm" disabled={busy != null} busy={busy === `rewrite${i}`} onClick={() => step(`rewrite${i}`, { action: "rewrite", day: i })}>Write it again</Button>
        </p>
      ))}
      {error && <p className="sp-fail" role="alert">{error}</p>}
    </section>
  );
}
