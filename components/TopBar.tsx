"use client";

// The floating headbar: the brand, the grouped navigation, the command menu
// (search and jump), the Brand Workspace switcher, Ask SOCIA, the bell and
// the account menu, in one centred bar that stays put while pages change
// beneath it. On phones it keeps the brand, the section's name, search, Ask
// SOCIA and the bell, and the rest moves into the menu sheet.

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu as MenuIcon, Search } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import { AskHost } from "@/components/AskSocia";
import { AlertsBell, type AlertItem } from "@/components/AlertsBell";
import { CommandMenu, type SearchItem } from "@/components/CommandMenu";
import MobileSheet from "@/components/MobileSheet";
import { HeadNav } from "@/components/SideNav";
import { IconButton } from "@/components/system";
import { activeNavLabel } from "@/lib/nav";
import type { Activity } from "@/lib/overview";

export type { AlertItem, SearchItem };

export default function TopBar({
  index,
  activity,
  alerts = [],
  unread = 0,
  workspace,
  account,
  sheet,
}: {
  index: SearchItem[];
  activity: Activity[];
  alerts?: AlertItem[];
  unread?: number;
  workspace: ReactNode;
  account: ReactNode;
  sheet: ReactNode;
}) {
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
    <header className="s-headbar">
      <Link href="/dashboard" className="s-brand" aria-label="SOCIA, go to the dashboard">
        <BrandMark size={24} />
        <span>SOCIA</span>
      </Link>
      <span className="s-headbar-title">{title}</span>
      <span className="s-headbar-sep" aria-hidden />
      <HeadNav />
      <div className="s-headbar-tools">
        <button type="button" className="s-search" onClick={() => setCmd(true)} aria-haspopup="dialog" aria-expanded={cmd} aria-label="Search pages, posts and actions">
          <Search aria-hidden />
          <span>Search</span>
          <kbd className="s-kbd" aria-hidden>
            {mod}K
          </kbd>
        </button>
        <div className="s-headbar-ws">{workspace}</div>
        <AskHost />
        <AlertsBell alerts={alerts} unread={unread} activity={activity} />
        <div className="s-headbar-account">{account}</div>
        <IconButton label="Menu" className="s-headbar-menu" onClick={() => setMenu(true)} aria-haspopup="dialog" aria-expanded={menu}>
          <MenuIcon />
        </IconButton>
      </div>
      <CommandMenu open={cmd} onOpenChange={setCmd} index={index} />
      <MobileSheet open={menu} onOpenChange={setMenu}>
        {sheet}
      </MobileSheet>
    </header>
  );
}
