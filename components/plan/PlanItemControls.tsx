"use client";

// Per-post controls on the weekly plan: approve (puts it on the Calendar as a
// draft; nothing publishes), turn down with optional feedback (the next plan
// reads it), edit or move it to another day, and add an idea of your own. The
// owner of each decision is the person; SOCIA only records it.

import { useState } from "react";
import { Check, Pencil, X, Undo2 } from "lucide-react";
import { Button, Dialog, Field, Input, Select, Textarea } from "@/components/system";
import { FEEDBACK_REASONS, reasonLabel, type PlanItem } from "@/lib/planItems";
import "./plan-items.css";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const FORMATS = ["Reel", "Carousel", "Static", "Story"];
const PLATFORMS = ["Instagram", "Facebook", "YouTube", "TikTok"];

export function DecisionTag({ item }: { item: PlanItem }) {
  if (item.decision?.status === "approved") return <span className="pi-tag pi-ok">Approved</span>;
  if (item.decision?.status === "rejected") return <span className="pi-tag pi-no">Turned down</span>;
  if (item.source === "own") return <span className="pi-tag">Your idea</span>;
  return null;
}

/** The reasons someone gave, under a turned-down idea. */
export function RejectedNote({ item }: { item: PlanItem }) {
  const d = item.decision;
  if (d?.status !== "rejected") return null;
  const why = [...(d.reasons ?? []).map(reasonLabel), d.note].filter(Boolean).join("; ");
  return <p className="pi-why">{why ? `Why: ${why}. The next plan takes this into account.` : "The next plan won't suggest it again."}</p>;
}

export function ItemActions({ item, canApprove, approveHint, busy, onApprove, onReject, onEdit, onUndo }: {
  item: PlanItem;
  canApprove: boolean;
  approveHint: string | null;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
  onUndo: () => void;
}) {
  if (item.decision) {
    return (
      <div className="pi-actions">
        {item.decision.status === "rejected" && <Button size="sm" variant="ghost" onClick={onUndo} busy={busy}><Undo2 size={13} aria-hidden /> Undo</Button>}
        {item.decision.status === "approved" && <span className="pi-hint">On the Calendar as a draft.</span>}
      </div>
    );
  }
  return (
    <div className="pi-actions">
      <Button size="sm" variant="primary" onClick={onApprove} busy={busy} disabled={!canApprove} title={approveHint ?? undefined}><Check size={13} aria-hidden /> Approve</Button>
      <Button size="sm" onClick={onEdit}><Pencil size={13} aria-hidden /> Edit</Button>
      <Button size="sm" variant="ghost" onClick={onReject}><X size={13} aria-hidden /> Turn down</Button>
      {approveHint && <span className="pi-hint">{approveHint}</span>}
    </div>
  );
}

export function RejectDialog({ open, day, onClose, onConfirm }: { open: boolean; day: string; onClose: () => void; onConfirm: (reasons: string[], note: string | null, replace: boolean) => void }) {
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const toggle = (id: string) => setReasons((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]));
  const done = (replace: boolean) => {
    onConfirm(reasons, note.trim() || null, replace);
    setReasons([]);
    setNote("");
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={`Turn down ${day}'s idea`}
      description="Optional: say why, and the next plan takes it into account."
      actions={
        <>
          <Button variant="ghost" onClick={() => done(false)}>Turn down</Button>
          <Button variant="primary" onClick={() => done(true)}>Turn down and suggest another</Button>
        </>
      }
    >
      <div className="pi-reasons" role="group" aria-label="Why">
        {FEEDBACK_REASONS.map((r) => (
          <button key={r.id} type="button" className="pi-reason" aria-pressed={reasons.includes(r.id)} onClick={() => toggle(r.id)}>{r.label}</button>
        ))}
      </div>
      <Field label="Anything else" optional><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></Field>
    </Dialog>
  );
}

type Draft = Pick<PlanItem, "day" | "title" | "concept" | "hook" | "format" | "platform">;

/** Edit a planned post, or add an idea of your own (`item` null). Moving the day is locked once it is on the Calendar. */
export function ItemDialog({ open, item, dayLocked, onClose, onSave }: { open: boolean; item: PlanItem | null; dayLocked: boolean; onClose: () => void; onSave: (d: Draft) => void }) {
  const blank: Draft = { day: "Monday", title: "", concept: "", hook: "", format: "Reel", platform: "Instagram" };
  const [d, setD] = useState<Draft>(item ? { day: item.day, title: item.title ?? "", concept: item.concept, hook: item.hook, format: item.format, platform: item.platform ?? "Instagram" } : blank);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const ok = d.concept.trim().length > 0;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={item ? `Edit ${item.day}` : "Add your own idea"}
      width={560}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!ok} onClick={() => onSave({ ...d, title: d.title?.trim() || undefined })}>{item ? "Save" : "Add to the plan"}</Button>
        </>
      }
    >
      <div className="pi-form">
        <div className="pi-row">
          <Field label="Day" hint={dayLocked ? "Already on the Calendar: move it there." : undefined}>
            <Select value={DAYS.includes(d.day) ? d.day : "Monday"} onChange={(e) => set("day", e.target.value)} disabled={dayLocked}>
              {DAYS.map((x) => <option key={x}>{x}</option>)}
            </Select>
          </Field>
          <Field label="Format">
            <Select value={FORMATS.includes(d.format) ? d.format : "Reel"} onChange={(e) => set("format", e.target.value)}>
              {FORMATS.map((x) => <option key={x}>{x}</option>)}
            </Select>
          </Field>
          <Field label="Platform">
            <Select value={d.platform ?? "Instagram"} onChange={(e) => set("platform", e.target.value)}>
              {PLATFORMS.map((x) => <option key={x}>{x}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Title" optional><Input value={d.title ?? ""} onChange={(e) => set("title", e.target.value)} maxLength={80} /></Field>
        <Field label="The idea"><Textarea rows={3} value={d.concept} onChange={(e) => set("concept", e.target.value)} maxLength={1200} /></Field>
        <Field label="First line" optional><Input value={d.hook} onChange={(e) => set("hook", e.target.value)} maxLength={400} /></Field>
      </div>
    </Dialog>
  );
}
