"use client";

// "What's Missing": ranked, evidence-backed gaps. Each row expands to the
// observation, the performance behind it, the gap and the action, with the
// action buttons leading somewhere real. Impact labels come from the ranking
// in lib/gaps, never from prose.

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Sparkles, MessageSquare, CalendarPlus, ArrowRight } from "lucide-react";
import type { Gap, GapAction } from "@/lib/gaps";

const IMPACT: Record<Gap["impact"], { label: string; cls: string }> = {
  high: { label: "High impact", cls: "danger" },
  medium: { label: "Medium impact", cls: "warning" },
  early: { label: "Early signal", cls: "info" },
};

function ActionButton({ a, primary, onTab }: { a: GapAction; primary: boolean; onTab: (t: NonNullable<GapAction["tab"]>) => void }) {
  const cls = `ov-btn ${primary ? "primary" : "ghost"} small`;
  const icon = a.label.startsWith("Add") ? <Sparkles size={12} /> : a.label.startsWith("Generate") || a.label.startsWith("Create") ? <Sparkles size={12} /> : a.label.startsWith("Ask") ? <MessageSquare size={12} /> : a.label.startsWith("Schedule") ? <CalendarPlus size={12} /> : <ArrowRight size={12} />;
  if (a.tab) return <button type="button" className={cls} onClick={() => onTab(a.tab!)}>{icon} {a.label}</button>;
  return <Link href={a.href ?? "#"} className={cls}>{icon} {a.label}</Link>;
}

export default function GapList({ gaps, onTab, pending = false }: { gaps: Gap[]; onTab: (t: NonNullable<GapAction["tab"]>) => void; pending?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!gaps.length) {
    return (
      <div className="ov-empty">
        <b>{pending ? "Not enough posts yet." : "No gaps SOCIA can back with evidence right now."}</b>
        <p>{pending ? "SOCIA needs at least five dated posts before it compares what you do with what works." : "Your recent cadence, format mix, captions and timing all line up with what your own numbers reward. This re-runs on every sync."}</p>
      </div>
    );
  }
  return (
    <ol className="gap-list">
      {gaps.map((g, i) => {
        const on = open === g.id;
        const imp = IMPACT[g.impact];
        return (
          <li key={g.id} className={`gap${on ? " on" : ""}`}>
            <button type="button" className="gap-row" aria-expanded={on} onClick={() => setOpen(on ? null : g.id)}>
              <span className="gap-num">{String(i + 1).padStart(2, "0")}</span>
              <span className="gap-body">
                <span className="gap-title">
                  <b>{g.title}</b>
                  <em className={`ov-chip ${imp.cls}`}>{imp.label}</em>
                </span>
                <small>{g.headline}</small>
              </span>
              <ChevronDown size={15} className="gap-chev" />
            </button>
            {on && (
              <div className="gap-evidence">
                <div className="ov-why-block"><small>Observed</small><ul>{g.observed.map((o) => <li key={o}>{o}</li>)}</ul></div>
                {g.performance && <div className="ov-why-block"><small>Performance</small><p>{g.performance}</p></div>}
                <div className="ov-why-block ai"><small>Gap</small><p>{g.gap}</p></div>
                <div className="ov-why-block rec"><small>Action</small><p>{g.action}</p></div>
                <div className="gap-actions">
                  <ActionButton a={g.cta} primary onTab={onTab} />
                  {g.secondary && <ActionButton a={g.secondary} primary={false} onTab={onTab} />}
                </div>
              </div>
            )}
            {!on && (
              <div className="gap-quick">
                <ActionButton a={g.cta} primary={false} onTab={onTab} />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
