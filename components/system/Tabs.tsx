"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cn } from "@/lib/utils";

/** Underline tabs on a full-width rule. Base UI supplies roles, arrow keys and panels. */
export function Tabs(props: TabsPrimitive.Root.Props) {
  return <TabsPrimitive.Root {...props} />;
}

export function TabList({ className, ...props }: TabsPrimitive.List.Props) {
  return <TabsPrimitive.List className={cn("s-tabs", className)} {...props} />;
}

export function Tab({ count, children, ...props }: TabsPrimitive.Tab.Props & { count?: number | null }) {
  return (
    <TabsPrimitive.Tab {...props}>
      {children}
      {count != null && <span className="s-count">{count}</span>}
    </TabsPrimitive.Tab>
  );
}

export function TabPanel(props: TabsPrimitive.Panel.Props) {
  return <TabsPrimitive.Panel {...props} />;
}
