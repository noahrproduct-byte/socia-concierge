"use client";

// Client wrapper that holds the active-platform state and switches panels
// instantly (no refetch). Platform-specific panels arrive pre-rendered from the
// server as nodes; the All-Platforms panel is rendered here so its per-platform
// "View analytics →" buttons can switch tabs immediately. The URL's ?platform=
// is kept in sync with history.replaceState — shareable, no server round-trip.

import { useCallback, useState, type ReactNode } from "react";
import PlatformTabs, { type PlatformTab } from "./PlatformTabs";
import AllPlatformsAnalytics from "./AllPlatformsAnalytics";
import type { OverlayLine } from "./ov/MultiLineChart";
import type { AllPlatformsData } from "@/lib/metrics/allPlatforms";

export default function AnalyticsShell({
  tabs,
  initial,
  panels,
  allData,
  overlay,
  today,
}: {
  tabs: PlatformTab[];
  initial: string;
  panels: Record<string, ReactNode>;
  allData: AllPlatformsData | null;
  overlay: { lines: OverlayLine[]; note: string };
  today?: string;
}) {
  const [active, setActive] = useState(initial);

  const select = useCallback((id: string) => {
    setActive(id);
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("platform", id);
      window.history.replaceState(null, "", u.toString());
    } catch {
      /* history not available (SSR / sandbox) — state still switches */
    }
  }, []);

  return (
    <>
      <PlatformTabs tabs={tabs} active={active} onSelect={select} />
      <div className="pa-panel" key={active}>
        {active === "all" && allData ? (
          <AllPlatformsAnalytics data={allData} overlay={overlay} today={today} onOpen={select} />
        ) : (
          panels[active] ?? null
        )}
      </div>
    </>
  );
}
