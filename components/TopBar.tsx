"use client";

// The floating dock: the brand, six direct section links and All sections,
// then search (the command menu), Ask SOCIA, the bell and the account, in one
// frosted-glass object centred above the page that stays put while pages
// change beneath it. It wears the page's tokens, like its portalled popups.
// On phones the links move into the All sections panel, opened by the menu
// button.

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
  account,
  workspace,
  workspaceId = null,
  sheet,
}: {
  index: SearchItem[];
  activity: Activity[];
  alerts?: AlertItem[];
  unread?: number;
  account: ReactNode;
  /** The headbar's workspace switcher (hidden on phones, where the panel has it). */
  workspace?: ReactNode;
  /** The active Brand Workspace's id: Ask SOCIA keeps a separate thread for each. */
  workspaceId?: string | null;
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
      <HeadNav onAll={() => setMenu(true)} allOpen={menu} />
      <div className="s-headbar-tools">
        {workspace}
        <button type="button" className="s-search" onClick={() => setCmd(true)} aria-haspopup="dialog" aria-expanded={cmd} aria-label="Search pages, posts and actions" title={`Search (${mod}K)`}>
          <Search aria-hidden />
        </button>
        <AskHost workspaceId={workspaceId} />
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
