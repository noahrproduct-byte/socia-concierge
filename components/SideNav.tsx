"use client";

// The section links. HeadNav is the floating dock's navigation: the five
// daily destinations linked directly (no menus), a selection surface that
// glides to the current one and takes its width, and a More button that
// opens the panel with everything else. When the current page is not on the
// dock, the surface rests on More instead. TabBar is the same five on phones,
// pinned to the bottom of the screen. SideNav is the full list, grouped, for
// the More panel. The shell lives in a layout that stays mounted across
// navigations, so what is current is derived from the URL here.

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  Clapperboard,
  ClipboardList,
  FileBarChart,
  House,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  LifeBuoy,
  MessageSquare,
  Newspaper,
  PenLine,
  Radar,
  Scissors,
  Settings,
  Users,
  Film,
  type LucideIcon,
} from "lucide-react";
import { DOCK, HELP, NAV, NAV_GROUPS, activeNavKey, dockKeyFor } from "@/lib/nav";

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  analytics: BarChart3,
  discover: Radar,
  roundup: Newspaper,
  reports: FileBarChart,
  plan: ClipboardList,
  create: PenLine,
  calendar: CalendarDays,
  studio: Clapperboard,
  clipper: Scissors,
  "ai-studio": Film,
  comments: MessageSquare,
  contacts: Users,
  settings: Settings,
};

/** The dock's icons, for the phone tab bar: by dock key, in the dock's words. */
const DOCK_ICONS: Record<string, LucideIcon> = {
  dashboard: House,
  plan: ClipboardList,
  create: PenLine,
  analytics: BarChart3,
  comments: Inbox,
};

const ALL = "all";

/** The dock's navigation: direct links, one gliding selection surface, and the More button. */
export function HeadNav({ onAll, allOpen }: { onAll: () => void; allOpen: boolean }) {
  const pathname = usePathname();
  const activeKey = activeNavKey(pathname);
  const dockKey = dockKeyFor(activeKey);
  const onDock = dockKey != null;
  // Off the dock (Discover, Studio, Settings...), the surface marks More.
  const target = onDock ? dockKey : activeKey ? ALL : null;
  const root = useRef<HTMLElement>(null);
  const items = useRef<Record<string, HTMLElement | null>>({});
  const [box, setBox] = useState<{ x: number; w: number } | null>(null);
  // Transitions switch on after the first placement, so the surface lands in
  // place on load and only glides when the person moves between sections.
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const place = () => {
      const el = target ? items.current[target] : null;
      setBox(el ? { x: el.offsetLeft, w: el.offsetWidth } : null);
    };
    place();
    const frame = requestAnimationFrame(() => setReady(true));
    // Web fonts and zoom change the links' widths after the first measure.
    const ro = new ResizeObserver(place);
    if (root.current) ro.observe(root.current);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [target]);

  return (
    <nav ref={root} className="s-hnav" aria-label="Main" data-ready={ready || undefined}>
      <span
        className="s-hnav-indicator"
        aria-hidden
        data-hidden={box ? undefined : ""}
        style={box ? { transform: `translateX(${box.x}px)`, width: box.w } : undefined}
      />
      <ul className="s-hnav-list">
        {DOCK.map((d) => {
          const n = NAV.find((x) => x.key === d.key)!;
          const current = dockKey === d.key;
          return (
            <li key={d.key}>
              <Link
                href={n.href}
                className="s-hnav-link"
                ref={(el) => {
                  items.current[d.key] = el;
                }}
                // On the Calendar the Plan link is the current section, not the current page.
                aria-current={activeKey === d.key ? "page" : current ? "true" : undefined}
                data-current={current || undefined}
              >
                {d.label}
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            className="s-hnav-link s-hnav-more"
            ref={(el) => {
              items.current[ALL] = el;
            }}
            onClick={onAll}
            aria-haspopup="dialog"
            aria-expanded={allOpen}
            aria-label={onDock ? "More sections" : `More sections, current: ${NAV.find((n) => n.key === activeKey)?.label ?? "none"}`}
            data-current={(!onDock && activeKey != null) || undefined}
          >
            <LayoutGrid aria-hidden />
            <span>More</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}

/** The five daily destinations on phones: a tab bar pinned to the bottom of the screen. */
export function TabBar() {
  const pathname = usePathname();
  const activeKey = activeNavKey(pathname);
  const dockKey = dockKeyFor(activeKey);
  return (
    <nav className="s-tabbar" aria-label="Main">
      {DOCK.map((d) => {
        const n = NAV.find((x) => x.key === d.key)!;
        const Icon = DOCK_ICONS[d.key] ?? ICONS[d.key];
        const current = dockKey === d.key;
        return (
          <Link
            key={d.key}
            href={n.href}
            className="s-tab"
            aria-current={activeKey === d.key ? "page" : current ? "true" : undefined}
            data-current={current || undefined}
          >
            <Icon aria-hidden />
            <span>{d.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Every section for the More panel, one group after another. */
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
          {g.key === "manage" && (
            <Link href={HELP.href} className="s-nav-item">
              <LifeBuoy aria-hidden />
              <span>{HELP.label}</span>
            </Link>
          )}
        </div>
      ))}
    </nav>
  );
}
