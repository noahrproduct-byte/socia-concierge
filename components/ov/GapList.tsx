"use client";

// "What's Missing": ranked, evidence-backed gaps. Each row expands to the
// observation, the performance behind it, the gap and the action, with the
// action buttons leading somewhere real. Impact labels come from the ranking
// in lib/gaps, never from prose.

import "@/app/(app)/analytics/analytics.css";
import { useState } from "react";
import { ChevronDown, Sparkles, MessageSquare, CalendarPlus, ArrowRight } from "lucide-react";
import type { Gap, GapAction } from "@/lib/gaps";
import { Button, ButtonLink, Empty, StatusPill, type PillTone } from "@/components/system";

const IMPACT: Record<Gap["impact"], { label: string; tone: PillTone }> = {
  high: { label: "High impact", tone: "negative" },
  medium: { label: "Medium impact", tone: "warning" },
  early: { label: "Early signal", tone: "outline" },
};

function ActionButton({ a, primary, onTab }: { a: GapAction; primary: boolean; onTab: (t: NonNullable<GapAction["tab"]>) => void }) {
  const variant = primary ? "primary" : "secondary";
  const icon = a.label.startsWith("Add") || a.label.startsWith("Generate") || a.label.startsWith("Create") ? <Sparkles aria-hidden /> : a.label.startsWith("Ask") ? <MessageSquare aria-hidden /> : a.label.startsWith("Schedule") ? <CalendarPlus aria-hidden /> : <ArrowRight aria-hidden />;
  if (a.tab) {
    return (
      <Button variant={variant} size="sm" onClick={() => onTab(a.tab!)}>
        {icon} {a.label}
      </Button>
    );
  }
  return (
    <ButtonLink href={a.href ?? "#"} variant={variant} size="sm">
      {icon} {a.label}
    </ButtonLink>
  );
}

export default function GapList({ gaps, onTab, pending = false }: { gaps: Gap[]; onTab: (t: NonNullable<GapAction["tab"]>) => void; pending?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!gaps.length) {
    return (
      <Empty>
        <b>{pending ? "Not enough posts yet." : "No gaps SOCIA can back with evidence right now."}</b>{" "}
        {pending ? "SOCIA needs at least five dated posts before it compares what you do with what works." : "Your recent cadence, format mix, captions and timing all line up with what your own numbers reward. This re-runs on every sync."}
      </Empty>
    );
  }
  return (
    <ol>
      {gaps.map((g, i) => {
        const on = open === g.id;
        const imp = IMPACT[g.impact];
        const bodyId = `gap-${g.id}`;
        return (
          <li key={g.id} className="an-gap" data-open={on}>
            <button type="button" className="an-gap-head" aria-expanded={on} aria-controls={on ? bodyId : undefined} onClick={() => setOpen(on ? null : g.id)}>
              <span className="an-gap-rank">{String(i + 1).padStart(2, "0")}</span>
              <span className="an-row-body">
                <b>{g.title}</b>
                <small>{g.headline}</small>
              </span>
              <StatusPill tone={imp.tone}>{imp.label}</StatusPill>
              <ChevronDown aria-hidden />
            </button>
            {on ? (
              <div className="an-gap-body" id={bodyId}>
                <div className="an-why">
                  <div className="an-why-block">
                    <small>Observed</small>
                    <ul>{g.observed.map((o) => <li key={o}>{o}</li>)}</ul>
                  </div>
                  {g.performance && (
                    <div className="an-why-block">
                      <small>Performance</small>
                      <p>{g.performance}</p>
                    </div>
                  )}
                  <div className="an-why-block is-read">
                    <small>Gap</small>
                    <p>{g.gap}</p>
                  </div>
                  <div className="an-why-block">
                    <small>Action</small>
                    <p>{g.action}</p>
                  </div>
                </div>
                <div className="an-actions">
                  <ActionButton a={g.cta} primary onTab={onTab} />
                  {g.secondary && <ActionButton a={g.secondary} primary={false} onTab={onTab} />}
                </div>
              </div>
            ) : (
              <div className="an-gap-body">
                <ActionButton a={g.cta} primary={false} onTab={onTab} />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
