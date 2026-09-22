"use client";

// The tab strip over the content editor: General (the master caption) plus one
// tab per enabled destination. The page owns which tab is active so section 4
// (platform settings) can follow it.

import { readinessFor, type ComposerDraft, type PickerAccount } from "@/lib/publishing/composer";
import { PLATFORM_LABEL } from "@/lib/publishing/types";
import { PlatformMark, accountFor } from "./DestinationPicker";

export const GENERAL_TAB = "general";

export type Tab = { key: string; label: string; sub: string | null; platform: ComposerDraft["destinations"][number]["platform"] | null; level: "ready" | "warning" | "blocked" | null };

export function tabsFor(draft: ComposerDraft, accounts: PickerAccount[]): Tab[] {
  const general: Tab = { key: GENERAL_TAB, label: "General", sub: null, platform: null, level: null };
  const rows = draft.destinations.filter((d) => d.enabled).map<Tab>((d) => {
    const a = accountFor(d, accounts);
    const sameShown = draft.destinations.filter((x) => x.enabled && x.platform === d.platform).length > 1;
    return {
      key: d.key,
      label: PLATFORM_LABEL[d.platform],
      sub: sameShown ? (a?.handle ? `@${a.handle.replace(/^@/, "")}` : a?.label ?? null) : null,
      platform: d.platform,
      level: readinessFor(draft, d, accounts).level,
    };
  });
  return [general, ...rows];
}

export default function PlatformTabs({
  draft, accounts, active, onChange,
}: {
  draft: ComposerDraft;
  accounts: PickerAccount[];
  active: string;
  onChange: (key: string) => void;
}) {
  const tabs = tabsFor(draft, accounts);
  const current = tabs.some((t) => t.key === active) ? active : GENERAL_TAB;
  return (
    <div className="cp-tabs" role="tablist" aria-label="Content per platform">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={current === t.key}
          className={`cp-tab${current === t.key ? " on" : ""}`}
          onClick={() => onChange(t.key)}
        >
          {t.platform && <PlatformMark platform={t.platform} size={16} />}
          <span>{t.label}{t.sub ? <small>{t.sub}</small> : null}</span>
          {t.level && t.level !== "ready" && <i className={`cp-dot ${t.level}`} aria-label={t.level === "blocked" ? "Needs attention" : "Has warnings"} />}
        </button>
      ))}
    </div>
  );
}
