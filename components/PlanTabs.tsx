"use client";

// Plan's two pages: the weekly Content Plan and the Calendar. Links, so each
// keeps its own address (/plan, /plan/calendar) and the back button works.

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/plan", label: "Content Plan" },
  { href: "/plan/calendar", label: "Calendar" },
];

export default function PlanTabs() {
  const path = usePathname();
  const current = path?.startsWith("/plan/calendar") ? "/plan/calendar" : "/plan";
  return (
    <nav className="s-seg plan-tabs" aria-label="Plan">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={current === t.href ? "page" : undefined} data-selected={current === t.href || undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
