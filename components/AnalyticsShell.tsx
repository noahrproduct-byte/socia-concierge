"use client";

// Client wrapper that holds the active-platform state and switches panels
// instantly (no refetch). Platform-specific panels arrive pre-rendered from the
// server as nodes; the All-Platforms panel is rendered here so its per-platform
// "View analytics →" buttons can switch tabs immediately. The URL's ?platform=
// is kept in sync with history.replaceState — shareable, no server round-trip.
// One row of platform tabs, then everything on one scrolling page (redesign
// brief, 2026-11-03): the platform's own panel, then Content intelligence and
// Diagnostics (brand-wide, from SOCIA's findings) as sections under it. They
// used to sit behind a second switch above the tabs; an old ?view=content or
// ?view=diagnostics link now scrolls to its section.

import { useCallback, useEffect, useState, type ReactNode } from "react";
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

  const select = useCallback((id: string) => {
    setActive(id);
    setParam("platform", id);
  }, []);

  // Links like /analytics#content name a section of the Instagram panel
  // (Dashboard, Ask SOCIA, search). With more than one platform the page opens
  // on All Platforms, which has no such section: open Instagram instead, whose
  // panel reads the same hash when it mounts.
  useEffect(() => {
    const section = window.location.hash.slice(1);
    if (active === "all" && INSTAGRAM_SECTIONS.has(section) && tabs.some((t) => t.id === "instagram")) select("instagram");
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // An old ?view= link (from before the views became sections) lands on its section.
  useEffect(() => {
    if (!views || (initialView !== "content" && initialView !== "diagnostics")) return;
    document.getElementById(`pa-${initialView}`)?.scrollIntoView({ block: "start" });
    setParam("view", null);
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      {views && (
        <>
          <section className="pa-section" id="pa-content" aria-labelledby="pa-content-title">
            <h2 className="s-section-title" id="pa-content-title">Content intelligence</h2>
            {views.content}
          </section>
          <section className="pa-section" id="pa-diagnostics" aria-labelledby="pa-diagnostics-title">
            <h2 className="s-section-title" id="pa-diagnostics-title">Diagnostics</h2>
            {views.diagnostics}
          </section>
        </>
      )}
    </>
  );
}

const INSTAGRAM_SECTIONS = new Set(["overview", "content", "audience", "times", "growth", "posts"]);

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
