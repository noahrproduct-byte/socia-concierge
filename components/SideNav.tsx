"use client";

// The section links, grouped the way the headbar groups them. HeadNav is the
// desktop headbar: one menu per group, opened by hover, click or keyboard,
// with a blue-tinted indicator that glides to the group holding the current
// page. SideNav is the same list laid out flat for the phone sheet. The shell
// lives in a layout that stays mounted across navigations, so what is current
// is derived from the URL here instead of being passed down by each page.

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavigationMenu } from "@base-ui/react/navigation-menu";
import {
  BarChart3,
  CalendarDays,
  ChevronDown,
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
import { HELP, NAV, NAV_GROUPS, activeNavGroup, activeNavKey, type NavGroup } from "@/lib/nav";

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
  settings: Settings,
};

/** The desktop headbar's grouped navigation. */
export function HeadNav() {
  const pathname = usePathname();
  const activeKey = activeNavKey(pathname);
  const activeGroup = activeNavGroup(pathname);
  const list = useRef<HTMLElement>(null);
  const triggers = useRef<Partial<Record<NavGroup, HTMLButtonElement | null>>>({});
  const [box, setBox] = useState<{ x: number; w: number } | null>(null);
  // Transitions switch on after the first placement, so the indicator lands
  // in place on load and only glides when the person moves between groups.
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const place = () => {
      const el = activeGroup ? triggers.current[activeGroup] : null;
      setBox(el ? { x: el.offsetLeft, w: el.offsetWidth } : null);
    };
    place();
    const frame = requestAnimationFrame(() => setReady(true));
    // Web fonts and zoom change the triggers' widths after the first measure.
    const ro = new ResizeObserver(place);
    if (list.current) ro.observe(list.current);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [activeGroup]);

  return (
    <NavigationMenu.Root ref={list} className="s-hnav" aria-label="Main" delay={80} closeDelay={120} data-ready={ready || undefined}>
      <span
        className="s-hnav-indicator"
        aria-hidden
        data-hidden={box ? undefined : ""}
        style={box ? { transform: `translateX(${box.x}px)`, width: box.w } : undefined}
      />
      <NavigationMenu.List className="s-hnav-list">
        {NAV_GROUPS.map((g) => {
          const items = NAV.filter((n) => n.group === g.key);
          const current = activeGroup === g.key;
          return (
            <NavigationMenu.Item key={g.key} value={g.key}>
              <NavigationMenu.Trigger
                className="s-hnav-trigger"
                ref={(el) => {
                  triggers.current[g.key] = el;
                }}
                data-current={current || undefined}
              >
                {g.label}
                <NavigationMenu.Icon className="s-hnav-chev">
                  <ChevronDown aria-hidden />
                </NavigationMenu.Icon>
              </NavigationMenu.Trigger>
              <NavigationMenu.Content className="s-hnav-content">
                <ul className="s-hnav-links">
                  {items.map((n) => {
                    const Icon = ICONS[n.key];
                    return (
                      <li key={n.key}>
                        <NavigationMenu.Link
                          className="s-hnav-link"
                          active={activeKey === n.key}
                          aria-current={activeKey === n.key ? "page" : undefined}
                          closeOnClick
                          render={<Link href={n.href} />}
                        >
                          <Icon aria-hidden />
                          <span>{n.label}</span>
                        </NavigationMenu.Link>
                      </li>
                    );
                  })}
                  {g.key === "manage" && (
                    <li>
                      <NavigationMenu.Link className="s-hnav-link" closeOnClick render={<Link href={HELP.href} />}>
                        <LifeBuoy aria-hidden />
                        <span>{HELP.label}</span>
                      </NavigationMenu.Link>
                    </li>
                  )}
                </ul>
              </NavigationMenu.Content>
            </NavigationMenu.Item>
          );
        })}
      </NavigationMenu.List>
      <NavigationMenu.Portal>
        <NavigationMenu.Positioner className="s-hnav-pos" sideOffset={10} align="start" collisionPadding={16} style={{ zIndex: "var(--z-menu)" }}>
          <NavigationMenu.Popup className="s-hnav-pop">
            <NavigationMenu.Viewport className="s-hnav-view" />
          </NavigationMenu.Popup>
        </NavigationMenu.Positioner>
      </NavigationMenu.Portal>
    </NavigationMenu.Root>
  );
}

/** The same sections for the phone sheet, one group after another. */
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
