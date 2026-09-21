"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Calendar, ChevronDown, Check } from "lucide-react";
import { clampRangeId } from "@/lib/overview";
import { PLANS, minPlanWithLimit } from "@/lib/plans";
import "./planRange.css";

// Drives the page's real date range via ?range=, so every server-computed
// metric recalculates. Options are limited to ranges SOCIA can honour.
const OPTIONS: { label: string; days: string; n: number }[] = [
  { label: "Last 7 days", days: "7", n: 7 },
  { label: "Last 30 days", days: "30", n: 30 },
  { label: "Last 90 days", days: "90", n: 90 },
  { label: "Last 12 months", days: "365", n: 365 },
];

/** The cheapest plan that can look back `days`, for the locked-option tag. */
function planFor(days: number): string {
  const id = minPlanWithLimit("analytics_history_days", days);
  return id ? PLANS[id].name : "a custom plan";
}

/**
 * `maxDays`: the longest window the viewer's plan may look back over. Longer
 * options stay visible but are disabled with a tag naming the cheapest plan
 * that includes them; the server clamps the range regardless, so the selector
 * only tells the truth about it.
 */
export default function DateRangeSelector({ maxDays }: { maxDays?: number } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requested = params.get("range") ?? "30";
  // The URL may still say "90" after the server served 30 days; show the range
  // that was actually served, not the one that was asked for.
  const current = maxDays != null ? clampRangeId(requested, maxDays) : requested;
  const [open, setOpen] = useState(false);
  const value = OPTIONS.find((o) => o.days === current)?.label ?? "Last 30 days";
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="dropwrap" ref={ref}>
      <button className="pill-btn" onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open}>
        <Calendar size={15} />
        {value}
        <ChevronDown size={14} className="drop-chev" />
      </button>
      {open && (
        <div className="dropmenu" role="listbox">
          {OPTIONS.map((o) => {
            const locked = maxDays != null && o.n > maxDays;
            const planName = locked ? planFor(o.n) : null;
            return (
              <button
                key={o.days}
                className="dropitem"
                role="option"
                aria-selected={o.days === current}
                aria-disabled={locked || undefined}
                disabled={locked}
                title={planName ? `${o.label} is available on ${planName}` : undefined}
                onClick={() => {
                  if (locked) return;
                  const next = new URLSearchParams(params.toString());
                  next.set("range", o.days);
                  router.push(`${pathname}?${next.toString()}`);
                  setOpen(false);
                }}
              >
                {o.label}
                {planName ? <span className="range-tag">{planName}</span> : o.days === current && <Check size={14} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
