"use client";

// The platform switch for Analytics: underline tabs on a full-width rule
// (components/system Tabs, so roles, arrow keys and the panel link come from
// Base UI). Tabs switch the page's platform; a view or unit inside a platform
// is a segmented control in that view, never here. `between` renders under the
// rule and above the panel (the page's query bar); `children` is the panel.

import type { ReactNode } from "react";
import { Tab, TabList, TabPanel, Tabs } from "@/components/system";

export type PlatformTab = { id: string; label: string };

export default function PlatformTabs({
  tabs,
  active,
  onSelect,
  between,
  children,
}: {
  tabs: PlatformTab[];
  active: string;
  onSelect: (id: string) => void;
  between?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Tabs value={active} onValueChange={(v) => onSelect(String(v))} className="an-stack">
      <TabList aria-label="Platform">
        {tabs.map((t) => (
          <Tab key={t.id} value={t.id}>
            {t.label}
          </Tab>
        ))}
      </TabList>
      {between}
      {children !== undefined && (
        <TabPanel value={active}>
          {children}
        </TabPanel>
      )}
    </Tabs>
  );
}
