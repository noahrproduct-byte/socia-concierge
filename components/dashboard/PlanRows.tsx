"use client";

// The Dashboard's "Your plan": each video of the latest plan that is still on
// its way, with the one question that moves it on (did you film it, is it
// edited) and "Not doing it" to drop it. The answers are saved on the plan
// itself (PATCH /api/plans), so the Planner shows the same thing.
import { useState } from "react";
import Link from "next/link";
import { ButtonLink, Button } from "@/components/system";
import { PLAN_STEPS, postBuilderHref, stageAsk, type PlanRow } from "@/lib/planStage";

type Item = { day: string; concept: string; hook: string } & Record<string, unknown>;

export default function PlanRows({ planId, items, rows }: { planId: string; items: unknown[]; rows: PlanRow[] }) {
  const [plan, setPlan] = useState(items as Item[]);
  const [list, setList] = useState(rows);
  const [busy, setBusy] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const save = async (index: number, patch: Record<string, unknown>): Promise<boolean> => {
    const next = plan.map((it, i) => (i === index ? { ...it, ...patch } : it));
    setBusy(index); setNote(null);
    try {
      const res = await fetch("/api/plans", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: planId, weeklyPlan: next }) });
      if (!res.ok) { setNote("SOCIA couldn't save that just now. Try again."); return false; }
      setPlan(next);
      return true;
    } catch { setNote("SOCIA couldn't save that just now. Check your connection."); return false; } finally { setBusy(null); }
  };
  const made = async (r: PlanRow, step: "filmed" | "edited", go: string) => {
    if (await save(r.index, { made: { step, at: new Date().toISOString() } })) window.location.assign(go);
  };
  const drop = async (r: PlanRow) => {
    if (await save(r.index, { decision: { status: "rejected", at: new Date().toISOString(), reasons: [], note: null } })) setList((l) => l.filter((x) => x.index !== r.index));
  };
  if (!list.length) return null;

  return (
    <section className="dash-plan" aria-labelledby="dash-plan-title">
      <div className="dash-sec">
        <h2 id="dash-plan-title">Your plan</h2>
        <Link href="/plan" className="s-link">Open the Planner</Link>
      </div>
      <ul className="dash-plan-rows">
        {list.map((r) => {
          const item = plan[r.index];
          return (
            <li key={r.index} className="dash-lift">
              <span className="pl-dots dash-plan-dots" role="img" aria-label={`Step ${r.stage} of 4: ${PLAN_STEPS[r.stage - 1]}`}>{PLAN_STEPS.map((_, k) => <i key={k} className={k < r.stage ? "on" : undefined} />)}</span>
              <span className="dash-plan-body"><b>{r.title}</b><small>{r.animated && r.stage === 1 ? `Animated, planned for ${r.day}. SOCIA makes it.` : stageAsk(r.stage, r.day)}</small></span>
              <span className="dash-plan-acts">
                {r.animated && r.stage < 4 ? (
                  <ButtonLink href="/plan" variant="primary" size="sm">Make the video</ButtonLink>
                ) : r.stage === 1 ? (
                  <Button variant="primary" size="sm" busy={busy === r.index} onClick={() => made(r, "filmed", `/studio?mode=edit&plan=${encodeURIComponent(planId)}&i=${r.index}`)}>Yes, open the editor</Button>
                ) : r.stage === 2 ? (
                  <Button variant="primary" size="sm" busy={busy === r.index} onClick={() => made(r, "edited", postBuilderHref(planId, item))}>It&apos;s edited. Build the post</Button>
                ) : r.stage === 3 ? (
                  <ButtonLink href={postBuilderHref(planId, item)} variant="primary" size="sm">Build the post</ButtonLink>
                ) : (
                  <ButtonLink href="/plan/calendar" size="sm">On your Calendar</ButtonLink>
                )}
                {r.stage < 4 && <Button variant="ghost" size="sm" disabled={busy === r.index} onClick={() => drop(r)}>Not doing it</Button>}
              </span>
            </li>
          );
        })}
      </ul>
      {note && <p className="dash-note" role="status">{note}</p>}
    </section>
  );
}
