"use client";

// Client wrapper that holds the active-platform state and switches panels
// instantly (no refetch). Platform-specific panels arrive pre-rendered from the
// server as nodes; the All-platforms panel is rendered here so its per-platform
// "View analytics" buttons can switch tabs immediately. The URL's ?platform=
// is kept in sync with history.replaceState: shareable, no server round-trip.
//
// Layout under the page title: the platform tabs, then one labelled query bar
// (range for every tab, the Instagram account where it applies), then the view.

import "@/app/(app)/analytics/analytics.css";
import { useCallback, useState, type ReactNode } from "react";
import PlatformTabs, { type PlatformTab } from "./PlatformTabs";
import AllPlatformsAnalytics from "./AllPlatformsAnalytics";
import DateRangeSelector from "./DateRangeSelector";
import AccountSwitcher from "./AccountSwitcher";
import Mounted from "./ov/Mounted";
import { Skeleton } from "@/components/system";
import type { OverlayLine } from "./ov/MultiLineChart";
import type { AllPlatformsData } from "@/lib/metrics/allPlatforms";

/** Tabs whose view reads the active Instagram account, so the switcher belongs beside them. */
const ACCOUNT_TABS = new Set(["instagram", "all"]);

export default function AnalyticsShell({
  tabs,
  initial,
  panels,
  allData,
  overlay,
  today,
  maxDays,
  instagram = false,
}: {
  tabs: PlatformTab[];
  initial: string;
  panels: Record<string, ReactNode>;
  allData: AllPlatformsData | null;
  overlay: { lines: OverlayLine[]; note: string };
  today?: string;
  /** Longest window the viewer's plan may look back over; longer ranges show as locked. */
  maxDays?: number;
  /** Instagram is connected, so the account switcher is offered on the tabs that read it. */
  instagram?: boolean;
}) {
  const [active, setActive] = useState(initial);

  const select = useCallback((id: string) => {
    setActive(id);
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("platform", id);
      window.history.replaceState(null, "", u.toString());
    } catch {
      /* history not available (SSR / sandbox): state still switches */
    }
  }, []);

  const showAccount = instagram && ACCOUNT_TABS.has(active);
  const query = (
    <div className="s-query" role="group" aria-label="Analytics scope">
      <div className="s-query-item">
        <small>Range</small>
        <Mounted fallback={<Skeleton variant="value" width={150} />}>
          <DateRangeSelector maxDays={maxDays} />
        </Mounted>
      </div>
      {showAccount && (
        <Mounted fallback={<Skeleton variant="value" width={150} />}>
          <AccountSwitcher label="Instagram account" />
        </Mounted>
      )}
    </div>
  );

  return (
    <PlatformTabs tabs={tabs} active={active} onSelect={select} between={query}>
      <div className="an-stack" key={active}>
        {active === "all" && allData ? (
          <AllPlatformsAnalytics data={allData} overlay={overlay} today={today} onOpen={select} />
        ) : (
          panels[active] ?? null
        )}
      </div>
    </PlatformTabs>
  );
}
