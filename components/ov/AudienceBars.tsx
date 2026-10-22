"use client";

// Follower demographics with Age / Gender / Location views. Only what Instagram
// returned; when it returned nothing, the reason is shown instead of bars.
// Drawn as .s-bars (app/styles/charts.css).

import "@/app/styles/charts.css";
import { useState } from "react";
import { SegmentedControl } from "@/components/system";
import type { Demographics } from "@/lib/igDemographics";

const TABS = [["age", "Age"], ["gender", "Gender"], ["city", "Location"]] as const;
type TabId = (typeof TABS)[number][0];

export default function AudienceBars({ demo }: { demo: Demographics }) {
  const [tab, setTab] = useState<TabId>("age");
  if (demo.status !== "ok") {
    return (
      <div className="s-empty">
        <b>Not available for this account</b>
        <p>{demo.reason}</p>
      </div>
    );
  }
  const bars = demo[tab];
  const max = Math.max(...bars.map((b) => b.share), 0.0001);
  return (
    <div className="s-stack">
      <SegmentedControl<TabId>
        className="s-seg--sm"
        label="Audience breakdown"
        value={tab}
        onChange={setTab}
        options={TABS.map(([value, label]) => ({ value, label }))}
      />
      {bars.length ? (
        <ul className="s-bars">
          {bars.map((b) => (
            <li key={b.label}>
              <span>{b.label}</span>
              <span className="s-bars-track" aria-hidden><i style={{ width: `${(b.share / max) * 100}%` }} /></span>
              <b>{Math.round(b.share * 100)}%</b>
            </li>
          ))}
        </ul>
      ) : (
        <div className="s-empty">
          <p>Instagram returned no {tab === "city" ? "location" : tab} breakdown.</p>
        </div>
      )}
    </div>
  );
}
