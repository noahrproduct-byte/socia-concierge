"use client";

// Onboarding's goal step (Noah, 2026-11-15): pick one or more goals. Each
// shows where the account is now (read from the connected accounts when SOCIA
// can measure it, typed when it can't) and a target the person sets
// themselves: SOCIA doesn't fill one in (Noah, 2026-11-16: it offered 37
// followers when he wanted 5,000). One timeframe covers all of them, 30 days
// unless changed. The first goal picked is the main goal. Nothing here says a
// target will be met.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { CUSTOMER_GOALS, GOAL_PLATFORM_NAME, formatGoalValue, goalMetric, mainGoalsFor, type CustomerGoalId, type Goal, type GoalMetricId, type GoalPlatform, type MainGoalId } from "@/lib/growth";
import { TIMEFRAMES, daysUntil, dueFor, dueIn, goalStepError, goalStepSummary, targetNumber, type Timeframe } from "@/lib/goalStep";
import { Field, Input } from "@/components/system";
import { Choices } from "@/components/growth/GrowthFields";

export type GoalStepHandle = { save: () => Promise<boolean> };

type NowValues = Partial<Record<GoalMetricId, { value: number; platforms: GoalPlatform[] }>>;
type Props = {
  /** The goals table exists, so targets can be saved. */
  tableReady: boolean;
  connectedPlatforms: GoalPlatform[];
  initial: { main?: MainGoalId | ""; others?: MainGoalId[] };
  /** How the customer goal is worded for this brand: users for an app, bookings or orders for a restaurant (lib/goalWording.ts). */
  customerGoal: CustomerGoalId;
  /** The goal SOCIA read from the account, with its reason. */
  suggested: { goal: MainGoalId; reason: string } | null;
  today: string;
  /** How many goals are picked, so the step's button knows when it can continue. */
  onChosen: (count: number) => void;
};

const MINE = "socia.onb.goal-ids";
const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const show = (metric: GoalMetricId, n: number) => (goalMetric(metric)?.unit === "count" ? Math.round(n).toLocaleString("en-US") : String(n));

/** Ids of the goals this browser saved from this step, so a goal unpicked here can be removed without touching any other. */
function mine(): string[] {
  try { const v = JSON.parse(sessionStorage.getItem(MINE) ?? "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; }
}
function remember(ids: string[]) {
  try { sessionStorage.setItem(MINE, JSON.stringify([...new Set(ids)])); } catch { /* private window: nothing to remember */ }
}

const GoalStep = forwardRef<GoalStepHandle, Props>(function GoalStep({ tableReady, connectedPlatforms, initial, customerGoal, suggested, today, onChosen }, ref) {
  const GOALS = mainGoalsFor(customerGoal);
  const [chosen, setChosen] = useState<MainGoalId[]>(() => {
    const start = [initial.main, ...(initial.others ?? [])].filter((g): g is MainGoalId => Boolean(g));
    return start.length ? [...new Set(start)] : suggested ? [suggested.goal] : [];
  });
  // What the person typed, per goal.
  const [targets, setTargets] = useState<Partial<Record<MainGoalId, string>>>({});
  const [typedNow, setTypedNow] = useState<Partial<Record<MainGoalId, string>>>({});
  const [frame, setFrame] = useState<Timeframe>(30);
  const [due, setDue] = useState("");
  const [nowValues, setNowValues] = useState<NowValues | null>(connectedPlatforms.length ? null : {});
  const [saved, setSaved] = useState<Goal[]>([]);
  const [err, setErr] = useState<{ goal?: MainGoalId; text: string } | null>(null);
  const seeded = useRef(false);

  useEffect(() => { onChosen(chosen.length); }, [chosen.length, onChosen]);

  // Where the account stands now, read from the connected accounts.
  useEffect(() => {
    if (!connectedPlatforms.length) return;
    let alive = true;
    fetch("/api/goals/now").then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive) setNowValues((j?.now ?? {}) as NowValues); }).catch(() => { if (alive) setNowValues({}); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Goals already saved for this brand (coming back to this step): show them as they were set.
  useEffect(() => {
    if (!tableReady) return;
    let alive = true;
    fetch("/api/goals").then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!alive || seeded.current) return;
      seeded.current = true;
      const goals = (Array.isArray(j?.goals) ? j.goals : []) as Goal[];
      setSaved(goals);
      const t: Partial<Record<MainGoalId, string>> = {}, n: Partial<Record<MainGoalId, string>> = {};
      for (const m of GOALS) {
        const g = goals.find((x) => x.metric === m.metric);
        if (!g) continue;
        t[m.id] = show(m.metric, g.target);
        const at = g.current_value ?? g.baseline;
        if (!goalMetric(m.metric)?.measuredOn.length && at != null) n[m.id] = show(m.metric, at);
      }
      setTargets((v) => ({ ...t, ...v })); setTypedNow((v) => ({ ...n, ...v }));
      const primary = goals.find((g) => g.kind === "primary" && g.due_date && g.due_date > today);
      if (primary?.due_date) {
        const preset = TIMEFRAMES.find((d) => dueIn(d, today) === primary.due_date);
        if (preset) setFrame(preset); else { setFrame("custom"); setDue(primary.due_date); }
      }
    }).catch(() => undefined);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dueDate = dueFor(frame, due, today);
  const days = dueDate && dueDate > today ? daysUntil(dueDate, today) : null;

  /** One goal as it stands on the screen: its numbers and the target shown. */
  function view(id: MainGoalId) {
    const goal = GOALS.find((m) => m.id === id)!;
    const metric = goalMetric(goal.metric)!;
    const read = nowValues?.[goal.metric] ?? null;
    const now = read ? read.value : targetNumber(typedNow[id] ?? "");
    return { goal, metric, read, now, target: targets[id] ?? "", manual: !metric.measuredOn.length };
  }

  useImperativeHandle(ref, () => ({
    async save() {
      setErr(null);
      if (!chosen.length) return false;
      const views = chosen.map(view);
      if (tableReady) {
        if (!dueDate) { setErr({ text: "Choose the date you want to reach it by." }); return false; }
        if (dueDate <= today) { setErr({ text: "Choose a date after today." }); return false; }
        for (const v of views) {
          if (!v.read && (typedNow[v.goal.id] ?? "").trim() && v.now == null) { setErr({ goal: v.goal.id, text: `${v.goal.label}: type where you are now as a number.` }); return false; }
          const problem = goalStepError({ metric: v.goal.metric, target: v.target, frame, custom: due, today, now: v.now });
          if (problem) { setErr({ goal: v.goal.id, text: views.length > 1 ? `${v.goal.label}: ${problem}` : problem }); return false; }
        }
      }
      const labels = views.map((v) => v.goal.label);
      const r = await post("/api/profile", {
        brand_detail: { growth: { main_goal: chosen[0], other_goals: chosen.slice(1), customer_goal: customerGoal } },
        // Without the goals table the goals are still the brand's stated goals, in words.
        ...(tableReady ? {} : { goals: `Main goal: ${labels[0]}.${labels.length > 1 ? ` Also: ${labels.slice(1).join(", ")}.` : ""}` }),
      }).catch(() => null);
      if (!r?.ok) { setErr({ text: "Couldn't save your goals. Try again." }); return false; }
      if (!tableReady) return true;

      const ids = mine();
      for (const [i, v] of views.entries()) {
        const existing = saved.find((g) => g.metric === v.goal.metric);
        const where = v.metric.measuredOn.filter((p) => connectedPlatforms.includes(p));
        const gr = await post("/api/goals", {
          ...(existing?.id ? { id: existing.id } : {}),
          metric: v.goal.metric, target: targetNumber(v.target), due_date: dueDate,
          platforms: where.length ? where : v.metric.measuredOn.slice(0, 1),
          kind: i === 0 ? "primary" : "secondary",
          // A number only the person knows starts from what they typed; a measured one is read from the account by the server.
          ...(v.manual && v.now != null ? { baseline: existing?.baseline ?? v.now, current_value: v.now } : existing?.baseline != null && !v.manual ? { baseline: existing.baseline } : {}),
        }).catch(() => null);
        const gj = (await gr?.json().catch(() => null)) as { id?: string; error?: string } | null;
        if (!gr?.ok) { setErr({ goal: v.goal.id, text: gj?.error ? `${v.goal.label}: ${gj.error}` : "Couldn't save the target. Try again." }); return false; }
        if (gj?.id) ids.push(gj.id);
      }
      remember(ids);
      // A goal set from this step earlier and unpicked now is removed; goals made anywhere else are left alone.
      const keep = new Set<string>(views.map((v) => v.goal.metric));
      // Every number this step can set, under any wording of the customer goal.
      const pickable = new Set<string>([...GOALS.map((m) => m.metric), ...CUSTOMER_GOALS.map((c) => c.metric)]);
      for (const g of saved) {
        if (g.id && ids.includes(g.id) && pickable.has(g.metric) && !keep.has(g.metric)) await fetch(`/api/goals?id=${encodeURIComponent(g.id)}`, { method: "DELETE" }).catch(() => null);
      }
      const fresh = await fetch("/api/goals").then((x) => (x.ok ? x.json() : null)).catch(() => null);
      if (Array.isArray(fresh?.goals)) setSaved(fresh.goals as Goal[]);
      return true;
    },
  }));

  return (
    <div className="ob-fields">
      <Choices label="Goals" multi options={GOALS} value={chosen} onChange={(v) => { setChosen(v as MainGoalId[]); setErr(null); }} />
      <p className="gp-note">Pick one or more. The first one you pick is your main goal.</p>
      {suggested && chosen.includes(suggested.goal) && (
        <p className="gp-note">Suggested from your account: {suggested.reason} Keep it or pick others.</p>
      )}

      {chosen.map((id, i) => {
        const v = view(id);
        const unit = v.metric.unit === "percent" ? " (%)" : v.metric.unit === "per_week" ? " (posts a week)" : "";
        const bad = err?.goal === id;
        return (
          <section key={id} className="obg-goal" aria-label={v.goal.label}>
            <div className="obg-top">
              <h2>{v.goal.label}</h2>
              {chosen.length > 1 && i === 0 && <span className="obg-main">Main goal</span>}
            </div>
            <p className="gp-note">{v.metric.note}</p>
            {tableReady && (
              <>
                <div className="gp-row">
                  {v.read ? (
                    <div className="s-field">
                      <span className="s-label">Where you are now</span>
                      <p className="obg-now"><b>{formatGoalValue(v.goal.metric, v.read.value)}</b> <small>{v.read.platforms.map((x) => GOAL_PLATFORM_NAME[x]).join(" and ")}</small></p>
                    </div>
                  ) : (
                    <Field label={`Where you are now${unit}`}>
                      <Input inputMode="decimal" placeholder={nowValues || v.manual ? "Type a number" : "Reading your account"} value={typedNow[id] ?? ""}
                        onChange={(e) => { setTypedNow((x) => ({ ...x, [id]: e.target.value })); setErr(null); }} />
                    </Field>
                  )}
                  <Field label={`Target${unit}`} error={bad ? err!.text : undefined}>
                    <Input inputMode="decimal" value={v.target} aria-invalid={bad || undefined}
                      onChange={(e) => { setTargets((x) => ({ ...x, [id]: e.target.value })); setErr(null); }} />
                  </Field>
                </div>
                {!v.read && (
                  <p className="gp-note" role="status">
                    {v.manual ? "Type where you are now, so progress is measured from it."
                      : nowValues ? "SOCIA couldn't read where you are now for this goal. You can type it; your starting point is recorded from the account when the numbers arrive."
                      : "Reading where you are now."}
                  </p>
                )}
              </>
            )}
          </section>
        );
      })}

      {tableReady && chosen.length > 0 && (
        <>
          <Choices label="By when" columns={4} options={[...TIMEFRAMES.map((d) => ({ id: String(d), label: `${d} days` })), { id: "custom", label: "Pick a date" }]} value={String(frame)}
            onChange={(v) => { setFrame(v === "custom" ? "custom" : (Number(v) as Timeframe)); setErr(null); }} />
          {frame === "custom" && (
            <div className="gp-row">
              <Field label="Date">
                <Input type="date" min={today} value={due} onChange={(e) => { setDue(e.target.value); setErr(null); }} />
              </Field>
            </div>
          )}
          {days != null && chosen.some((id) => targetNumber(view(id).target) != null) && (
            <div className="obg-sum" role="status">
              <b>{chosen.length > 1 ? "Your goals" : "Your goal"}</b>
              <ul>
                {chosen.map((id) => {
                  const v = view(id);
                  const t = targetNumber(v.target);
                  return t == null ? null : <li key={id}>{v.goal.label}: {goalStepSummary(v.goal.metric, v.now, t, dueDate!, today)}</li>;
                })}
              </ul>
              <small>SOCIA measures against {chosen.length > 1 ? "them" : "it"} and never promises a result.</small>
            </div>
          )}
        </>
      )}
      {err && !err.goal && <div className="ob-err" role="alert">{err.text}</div>}
    </div>
  );
});

export default GoalStep;
