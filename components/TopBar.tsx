"use client";

// The 48px top bar. It holds real things only: the command menu (search and
// jump), Ask SOCIA, and the bell. On phones it also carries the menu button
// and the section's name.

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Menu as MenuIcon, Search } from "lucide-react";
import { AskHost } from "@/components/AskSocia";
import { AlertsBell, type AlertItem } from "@/components/AlertsBell";
import { CommandMenu, type SearchItem } from "@/components/CommandMenu";
import MobileSheet from "@/components/MobileSheet";
import { IconButton } from "@/components/system";
import { activeNavLabel } from "@/lib/nav";
import type { Activity } from "@/lib/overview";

export type { AlertItem, SearchItem };

export default function TopBar({ index, activity, alerts = [], unread = 0, sheet }: { index: SearchItem[]; activity: Activity[]; alerts?: AlertItem[]; unread?: number; sheet: ReactNode }) {
  const [cmd, setCmd] = useState(false);
  const [menu, setMenu] = useState(false);
  const [mod, setMod] = useState("⌘");
  const title = activeNavLabel(usePathname());

  useEffect(() => {
    if (!/Mac|iPhone|iPad/.test(navigator.platform)) setMod("Ctrl ");
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmd((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="s-topbar">
      <IconButton label="Menu" className="s-topbar-menu" onClick={() => setMenu(true)} aria-haspopup="dialog" aria-expanded={menu}>
        <MenuIcon />
      </IconButton>
      <span className="s-topbar-title">{title}</span>
      <button type="button" className="s-search" onClick={() => setCmd(true)} aria-haspopup="dialog" aria-expanded={cmd} aria-label="Search pages, posts and actions">
        <Search aria-hidden />
        <span>Search or jump to</span>
        <kbd className="s-kbd" aria-hidden>
          {mod}K
        </kbd>
      </button>
      <div className="s-topbar-end">
        <AskHost />
        <AlertsBell alerts={alerts} unread={unread} activity={activity} />
      </div>
      <CommandMenu open={cmd} onOpenChange={setCmd} index={index} />
      <MobileSheet open={menu} onOpenChange={setMenu}>
        {sheet}
      </MobileSheet>
    </header>
  );
}
