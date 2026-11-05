"use client";

// Who films each plan post (lib/teamWorkServer). On every post of a saved
// plan: the person it was handed to and the day to film it by, or, for the
// owner and Admins of a workspace with more than one person, "Hand to
// someone". The person gets a bell and the post on their Dashboard. The
// server checks role, plan and workspace again on every change.

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, UserRound } from "lucide-react";
import { Button, Field, Select, Input, Textarea } from "@/components/system";
import { dueLabel, nextDateFor, TASK_NOTE_MAX, type Person, type PlanTask } from "@/lib/teamWork";
import "../teamwork.css";

export type PlanTasksState = { enabled: boolean; canAssign: boolean; people: Person[]; tasks: PlanTask[] };

/** One plan's tasks and who can take them; nothing while loading or without a team. */
export function usePlanTasks(planId: string | null) {
  const [state, setState] = useState<PlanTasksState | null>(null);
  const reload = useCallback(async () => {
    if (!planId) { setState(null); return; }
    const r = await fetch(`/api/tasks?plan=${encodeURIComponent(planId)}`).catch(() => null);
    const j = r?.ok ? ((await r.json().catch(() => null)) as PlanTasksState | null) : null;
    setState(j?.enabled ? j : null);
  }, [planId]);
  useEffect(() => { void reload(); }, [reload]);
  return { state, reload };
}

async function send(url: string, method: string, body?: unknown): Promise<string | null> {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
  if (r?.ok) return null;
  const j = r ? ((await r.json().catch(() => null)) as { error?: string } | null) : null;
  return j?.error ?? "SOCIA couldn't save that. Try again.";
}

export function PlanTaskRow({ planId, item, state, reload }: {
  planId: string;
  item: { id?: string; day: string };
  state: PlanTasksState;
  reload: () => Promise<void>;
}) {
  const task = state.tasks.find((t) => t.itemId === item.id) ?? null;
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const others = state.people.filter((p) => !p.isYou);
  const [who, setWho] = useState<string>("");
  const [due, setDue] = useState<string>("");
  const [note, setNote] = useState<string>("");

  if (!item.id) return null;
  // Handing a post to yourself alone isn't teamwork: the control waits for a second person.
  const offer = state.canAssign && others.length > 0;
  if (!task && !offer) return null;

  const open = () => {
    setWho(task?.assigneeId ?? others[0]?.userId ?? "");
    setDue(task?.dueOn ?? nextDateFor(item.day) ?? "");
    setNote(task?.note ?? "");
    setError(null);
    setEditing(true);
  };
  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true); setError(null);
    const err = await fn();
    if (err) setError(err);
    else { setEditing(false); await reload(); }
    setBusy(false);
  };

  if (editing) {
    return (
      <form className="tw-assign" onSubmit={(e) => { e.preventDefault(); void run(() => send("/api/tasks", "POST", { planId, itemId: item.id, assigneeId: who, dueOn: due || null, note })); }}>
        <div className="tw-assign-row">
          <Field label="Who films it">
            <Select value={who} onChange={(e) => setWho(e.target.value)} required>
              {state.people.map((p) => <option key={p.userId} value={p.userId}>{p.label}</option>)}
            </Select>
          </Field>
          <Field label="Film by" optional>
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
        </div>
        <Field label="Note for them" optional>
          <Textarea rows={2} maxLength={TASK_NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything they should know, like when the shop is quiet" />
        </Field>
        <div className="tw-actions">
          <Button type="submit" variant="primary" size="sm" busy={busy} disabled={busy || !who}>{task ? "Save" : "Hand it over"}</Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button>
        </div>
        {error && <p className="tw-err" role="alert">{error}</p>}
      </form>
    );
  }

  if (!task) {
    return (
      <div className="tw-line">
        <Button size="sm" variant="secondary" onClick={open}><UserRound size={13} aria-hidden /> Hand to someone</Button>
      </div>
    );
  }

  const person = state.people.find((p) => p.userId === task.assigneeId);
  const dueAt = dueLabel(task.dueOn);
  const done = task.status === "done";
  return (
    <div className="tw-line">
      {done ? <CheckCircle2 size={14} aria-hidden className="tw-ok" /> : <UserRound size={14} aria-hidden />}
      <p>
        {done
          ? <>Filmed by <b>{person?.label ?? "someone who left"}</b>{task.postId ? ", footage added to a draft" : ""}.</>
          : <>{person?.isYou ? <><b>You</b> film this.</> : <>Handed to <b>{person?.label ?? "someone who left"}</b>.</>}{dueAt ? <span className={dueAt.late ? "tw-late" : undefined}> {dueAt.text}.</span> : null}</>}
        {task.note && !done && <span className="tw-note"> “{task.note}”</span>}
      </p>
      {state.canAssign && !done && (
        <span className="tw-actions">
          <Button size="sm" variant="ghost" disabled={busy} onClick={open}>Change</Button>
          <Button size="sm" variant="ghost" busy={busy} disabled={busy} onClick={() => void run(() => send(`/api/tasks/${task.id}`, "DELETE"))}>Take back</Button>
        </span>
      )}
      {error && <p className="tw-err" role="alert">{error}</p>}
    </div>
  );
}
