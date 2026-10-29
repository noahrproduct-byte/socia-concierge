"use client";

// The brand's measurable goals: what to grow, where SOCIA measures it, the
// target and the date. Each change saves straight away (/api/goals). A goal
// SOCIA can't measure says so, and asks the person for the number instead.

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button, Field, Input, Select, IconButton } from "@/components/system";
import { GOAL_METRICS, GOAL_PLATFORM_NAME, goalMetric, goalSentence, type Goal, type GoalMetricId, type GoalPlatform } from "@/lib/growth";
import "./growth.css";

const blank = { metric: "followers" as GoalMetricId, platforms: [] as GoalPlatform[], target: "", due: "", current: "" };

export default function GoalsEditor({
  initial,
  tableReady,
  connected,
  onChange,
}: {
  initial: Goal[];
  tableReady: boolean;
  /** Platforms connected in this brand, to say where a goal can be measured today. */
  connected: GoalPlatform[];
  onChange?: (goals: Goal[]) => void;
}) {
  const [goals, setGoals] = useState<Goal[]>(initial);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const m = goalMetric(form.metric)!;
  const update = (next: Goal[]) => {
    setGoals(next);
    onChange?.(next);
  };

  if (!tableReady) {
    return <p className="gp-note">Goals can be saved once SOCIA&apos;s database update for goals has run. Your other answers still save.</p>;
  }

  async function add() {
    setBusy(true);
    setError(null);
    const body = {
      metric: form.metric,
      platforms: form.platforms,
      target: form.target,
      due_date: form.due || null,
      current_value: m.measuredOn.length ? null : form.current || null,
      kind: goals.some((g) => g.kind === "primary") ? "secondary" : "primary",
    };
    try {
      const r = await fetch("/api/goals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Couldn't save that goal. Try again.");
      update([...goals, { id: j.id, kind: body.kind as Goal["kind"], metric: form.metric, platforms: m.measuredOn.length ? form.platforms : [], baseline: typeof j.baseline === "number" ? j.baseline : null, target: Number(String(form.target).replace(/,/g, "")), due_date: form.due || null, current_value: body.current_value ? Number(body.current_value) : null }]);
      setForm(blank);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that goal. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    const r = await fetch(`/api/goals?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    if (!r?.ok) return setError("Couldn't remove that goal. Try again.");
    update(goals.filter((g) => g.id !== id));
  }

  return (
    <div className="gp-goals">
      {goals.length > 0 && (
        <ul className="gp-goal-list">
          {goals.map((g) => (
            <li key={g.id}>
              <div>
                <b>{g.kind === "primary" ? "Main goal" : "Also"}</b>
                <span>{goalSentence(g)}</span>
                <small>
                  {goalMetric(g.metric)?.measuredOn.length && g.baseline == null
                    ? "No starting point yet: SOCIA records it once these accounts are connected and return a number."
                    : goalMetric(g.metric)?.note}
                </small>
              </div>
              {g.id && (
                <IconButton label="Remove goal" onClick={() => remove(g.id!)}>
                  <Trash2 size={15} />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="gp-goal-form">
        <Field label={goals.length ? "Add another goal" : "What do you want to grow?"}>
          <Select value={form.metric} onChange={(e) => setForm({ ...blank, metric: e.target.value as GoalMetricId })}>
            {GOAL_METRICS.map((g) => (
              <option key={g.id} value={g.id}>{g.label}</option>
            ))}
          </Select>
        </Field>
        <p className="gp-note">{m.note}</p>

        {m.measuredOn.length > 0 && (
          <fieldset className="gp-choices">
            <legend className="s-label">Measured on</legend>
            <div className="gp-platforms">
              {m.measuredOn.map((p) => {
                const on = form.platforms.includes(p);
                return (
                  <label key={p} className={`gp-platform${on ? " on" : ""}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => setForm({ ...form, platforms: on ? form.platforms.filter((x) => x !== p) : [...form.platforms, p] })}
                    />
                    {GOAL_PLATFORM_NAME[p]}
                    {!connected.includes(p) && <small>not connected yet</small>}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        <div className="gp-row">
          {!m.measuredOn.length && (
            <Field label="Where you are now" optional>
              <Input inputMode="decimal" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} />
            </Field>
          )}
          <Field label={m.unit === "percent" ? "Target (%)" : m.unit === "per_week" ? "Target a week" : "Target"}>
            <Input inputMode="decimal" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} />
          </Field>
          <Field label="By" optional>
            <Input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
          </Field>
        </div>
        {m.measuredOn.length > 0 && <p className="gp-note">SOCIA records where you start from your connected accounts when you save.</p>}
        {error && <p className="s-error" role="alert">{error}</p>}
        <Button onClick={add} busy={busy} disabled={!form.target || (m.measuredOn.length > 0 && !form.platforms.length)}>
          Save goal
        </Button>
      </div>
    </div>
  );
}
