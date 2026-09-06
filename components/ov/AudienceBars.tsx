"use client";

// Follower demographics with Age / Gender / Location tabs. Only what Instagram
// returned; when it returned nothing, the reason is shown instead of bars.

import { useState } from "react";
import type { Demographics } from "@/lib/igDemographics";

const TABS = [["age", "Age"], ["gender", "Gender"], ["city", "Location"]] as const;

export default function AudienceBars({ demo }: { demo: Demographics }) {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("age");
  if (demo.status !== "ok") {
    return (
      <div className="ov-empty small">
        <b>Not available for this account</b>
        <p>{demo.reason}</p>
      </div>
    );
  }
  const bars = demo[tab];
  const max = Math.max(...bars.map((b) => b.share), 0.0001);
  return (
    <div className="ov-demo">
      <div className="ov-seg" role="tablist" aria-label="Audience breakdown">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {bars.length ? (
        <ul className="ov-bars" key={tab}>
          {bars.map((b) => (
            <li key={b.label}>
              <span className="ov-bars-label">{b.label}</span>
              <span className="ov-bars-track"><i style={{ width: `${(b.share / max) * 100}%` }} /></span>
              <b>{Math.round(b.share * 100)}%</b>
            </li>
          ))}
        </ul>
      ) : (
        <div className="ov-empty small">Instagram returned no {tab === "city" ? "location" : tab} breakdown.</div>
      )}
    </div>
  );
}
