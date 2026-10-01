"use client";

// The top-level platform switcher for Analytics (and reused by the Dashboard
// filter). Compact, horizontally scrollable on small screens, platform icon +
// label, selected state obvious. Platform colour is only a small accent dot on
// the un-selected items; the selected pill uses SOCIA's primary.

import { LayoutGrid } from "lucide-react";
import { platformMark, PLATFORM_TINT, type PlatformKey } from "./platformMarks";

export type PlatformTab = { id: string; label: string };

const isPlatform = (id: string): id is PlatformKey => id === "instagram" || id === "youtube" || id === "facebook" || id === "tiktok";

export default function PlatformTabs({
  tabs,
  active,
  onSelect,
}: {
  tabs: PlatformTab[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="pswitch" role="tablist" aria-label="Platform">
      {tabs.map((t) => {
        const on = active === t.id;
        const tint = isPlatform(t.id) ? PLATFORM_TINT[t.id] : "var(--primary)";
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={on}
            className={on ? "on" : ""}
            onClick={() => onSelect(t.id)}
            style={{ ["--tint" as string]: tint } as React.CSSProperties}
          >
            <span className="pswitch-ico">
              {isPlatform(t.id) ? platformMark(t.id, on ? "currentColor" : tint, 15) : <LayoutGrid size={15} />}
            </span>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
