"use client";

// Client wrapper that holds the active-platform state and switches panels
// instantly (no refetch). Platform-specific panels arrive pre-rendered from the
// server as nodes; the All-Platforms panel is rendered here so its per-platform
// "View analytics →" buttons can switch tabs immediately. The URL's ?platform=
// is kept in sync with history.replaceState — shareable, no server round-trip.
// Above the platform tabs, a view switch: Performance (the platform panels),
// Content intelligence and Diagnostics (brand-wide, from SOCIA's findings),
// kept in ?view= the same way.

import { useCallback, useState, type ReactNode } from "react";
import { SegmentedControl } from "@/components/system";
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
  views,
  initialView = "performance",
}: {
  tabs: PlatformTab[];
  initial: string;
  panels: Record<string, ReactNode>;
  allData: AllPlatformsData | null;
  overlay: { lines: OverlayLine[]; note: string };
  today?: string;
  views?: { content: ReactNode; diagnostics: ReactNode };
  initialView?: string;
}) {
  const [active, setActive] = useState(initial);
  const [view, setView] = useState<View>(views && isView(initialView) ? initialView : "performance");

  const select = useCallback((id: string) => {
    setActive(id);
    setParam("platform", id);
  }, []);
  const pickView = useCallback((v: View) => {
    setView(v);
    setParam("view", v === "performance" ? null : v);
  }, []);

  return (
    <>
      {views && (
        <SegmentedControl
          className="pa-views"
          label="Analytics view"
          role="tablist"
          panelId={() => "pa-view-panel"}
          value={view}
          onChange={pickView}
          options={VIEWS.map((v) => ({ value: v.id, label: v.label }))}
        />
      )}
      <div id="pa-view-panel" role={views ? "tabpanel" : undefined}>
        <div hidden={view !== "performance"}>
          <PlatformTabs tabs={tabs} active={active} onSelect={select} />
          <div className="pa-panel" key={active}>
            {active === "all" && allData ? (
              <AllPlatformsAnalytics data={allData} overlay={overlay} today={today} onOpen={select} />
            ) : (
              panels[active] ?? null
            )}
          </div>
        </div>
        {/* Kept mounted while hidden, so a dismissed finding stays dismissed when switching back. */}
        {views && <div className="pa-panel" hidden={view !== "content"}>{views.content}</div>}
        {views && <div className="pa-panel" hidden={view !== "diagnostics"}>{views.diagnostics}</div>}
      </div>
    </>
  );
}

const VIEWS = [
  { id: "performance", label: "Performance" },
  { id: "content", label: "Content intelligence" },
  { id: "diagnostics", label: "Diagnostics" },
] as const;
type View = (typeof VIEWS)[number]["id"];
const isView = (v: string): v is View => VIEWS.some((x) => x.id === v);

function setParam(key: string, value: string | null) {
  try {
    const u = new URL(window.location.href);
    if (value == null) u.searchParams.delete(key);
    else u.searchParams.set(key, value);
    window.history.replaceState(null, "", u.toString());
  } catch {
    /* history not available (SSR / sandbox) — state still switches */
  }
}
