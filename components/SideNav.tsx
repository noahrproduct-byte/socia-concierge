"use client";

// The sidebar's section links. The shell lives in a layout that stays mounted
// across navigations, so the highlighted link is derived from the URL here
// instead of being passed down by each page.

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, BarChart3, Radar, FileText, FileBarChart, Clapperboard, CalendarDays, PenSquare, Settings, Sparkles, type LucideIcon,
} from "lucide-react";
import { NAV, activeNavKey } from "@/lib/nav";

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  analytics: BarChart3,
  competitors: Radar,
  roundup: Sparkles,
  tool: FileText,
  studio: Clapperboard,
  calendar: CalendarDays,
  create: PenSquare,
  reports: FileBarChart,
};

export function SideNav() {
  const active = activeNavKey(usePathname());
  return (
    <nav className="side-nav" aria-label="Main">
      {NAV.map(({ href, label, key }) => {
        const Icon = ICONS[key];
        return (
          <Link key={key} href={href} className={`side-link${active === key ? " active" : ""}`} aria-current={active === key ? "page" : undefined}>
            <Icon size={17} strokeWidth={2} className="side-ico" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function SideSettingsLink() {
  const active = activeNavKey(usePathname()) === "settings";
  return (
    <Link href="/settings" className={`side-link${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
      <Settings size={17} strokeWidth={2} className="side-ico" />
      <span>Settings</span>
    </Link>
  );
}
