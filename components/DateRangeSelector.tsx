"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Calendar, Check, ChevronDown } from "lucide-react";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/system";
import { clampRangeId } from "@/lib/overview";
import { PLANS, minPlanWithLimit } from "@/lib/plans";

// Drives the page's real date range via ?range=, so every server-computed
// metric recalculates. Options are limited to ranges SOCIA can honour.
const OPTIONS: { label: string; days: string; n: number }[] = [
  { label: "Last 7 days", days: "7", n: 7 },
  { label: "Last 30 days", days: "30", n: 30 },
  { label: "Last 90 days", days: "90", n: 90 },
  { label: "Last 12 months", days: "365", n: 365 },
];

/** The cheapest plan that can look back `days`, for the locked-option reason. */
function planFor(days: number): string {
  const id = minPlanWithLimit("analytics_history_days", days);
  return id ? PLANS[id].name : "a custom plan";
}

/**
 * `maxDays`: the longest window the viewer's plan may look back over. Longer
 * options stay visible but are disabled with the plan that includes them; the
 * server clamps the range regardless, so the selector only tells the truth
 * about it.
 */
export default function DateRangeSelector({ maxDays }: { maxDays?: number } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requested = params.get("range") ?? "30";
  // The URL may still say "90" after the server served 30 days; show the range
  // that was actually served, not the one that was asked for.
  const current = maxDays != null ? clampRangeId(requested, maxDays) : requested;
  const value = OPTIONS.find((o) => o.days === current)?.label ?? "Last 30 days";

  return (
    <Menu>
      <MenuTrigger className="s-btn s-btn--secondary">
        <Calendar aria-hidden />
        {value}
        <ChevronDown aria-hidden />
      </MenuTrigger>
      <MenuContent align="start" style={{ minWidth: 220 }}>
        {OPTIONS.map((o) => {
          const locked = maxDays != null && o.n > maxDays;
          return (
            <MenuItem
              key={o.days}
              disabled={locked}
              why={locked ? `On ${planFor(o.n)}` : undefined}
              end={o.days === current ? <Check aria-label="Selected" /> : undefined}
              onClick={() => {
                if (locked) return;
                const next = new URLSearchParams(params.toString());
                next.set("range", o.days);
                router.push(`${pathname}?${next.toString()}`);
              }}
            >
              <span>{o.label}</span>
            </MenuItem>
          );
        })}
      </MenuContent>
    </Menu>
  );
}
