"use client";

// The sidebar's section links, in two groups: what the person is
// understanding and what they are making. The shell lives in a layout that
// stays mounted across navigations, so the highlighted link is derived from
// the URL here instead of being passed down by each page.

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  Clapperboard,
  ClipboardList,
  FileBarChart,
  LayoutDashboard,
  LifeBuoy,
  MessageSquare,
  Newspaper,
  PenLine,
  Radar,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { NAV, NAV_GROUPS, activeNavKey } from "@/lib/nav";

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  analytics: BarChart3,
  competitors: Radar,
  roundup: Newspaper,
  reports: FileBarChart,
  tool: ClipboardList,
  create: PenLine,
  calendar: CalendarDays,
  studio: Clapperboard,
  comments: MessageSquare,
};

/** `counts` appear only on queues that need action (comments waiting, posts to approve). */
export function SideNav({ counts }: { counts?: Partial<Record<string, number>> }) {
  const active = activeNavKey(usePathname());
  return (
    <nav className="s-nav" aria-label="Main">
      {NAV_GROUPS.map((g) => (
        <div className="s-nav-group" key={g.key}>
          <div className="s-nav-label">{g.label}</div>
          {NAV.filter((n) => n.group === g.key).map((n) => {
            const Icon = ICONS[n.key];
            const count = counts?.[n.key];
            return (
              <Link key={n.key} href={n.href} className="s-nav-item" aria-current={active === n.key ? "page" : undefined}>
                <Icon aria-hidden />
                <span>{n.label}</span>
                {count ? (
                  <i className="s-nav-count" aria-label={`${count} waiting`}>
                    {count}
                  </i>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

const FOOT_ICONS = { settings: Settings, help: LifeBuoy } as const;

/** A single link in the sidebar's foot (Settings, Help). The icon is named, not passed, so a server component can render it. */
export function SideLink({ href, icon, label, navKey }: { href: string; icon: keyof typeof FOOT_ICONS; label: string; navKey?: string }) {
  const Icon = FOOT_ICONS[icon];
  const current = activeNavKey(usePathname());
  const active = navKey ? current === navKey : false;
  return (
    <Link href={href} className="s-nav-item" aria-current={active ? "page" : undefined}>
      <Icon aria-hidden />
      <span>{label}</span>
    </Link>
  );
}
