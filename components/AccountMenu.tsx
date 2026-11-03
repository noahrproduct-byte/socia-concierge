"use client";

// The account control: who is signed in and on which plan, opening
// Settings, the next plan (owners only) and Log out. In the
// headbar it is the avatar alone with the name and plan at the top of its
// menu; in the phone sheet it is the full row.

import { ArrowUpRight, ChevronsUpDown, LogOut, Settings } from "lucide-react";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/system";
import { PLANS, type PlanId } from "@/lib/plans";

export default function AccountMenu({
  email,
  plan = "free",
  compact = false,
  upgrade,
}: {
  email?: string | null;
  plan?: PlanId;
  compact?: boolean;
  /** The next plan's pricing link, shown to the workspace owner only. */
  upgrade?: { href: string; name: string } | null;
}) {
  const name = (email?.split("@")[0] ?? "account").replace(/[._-]+/g, " ");
  const initial = (email?.[0] ?? "?").toUpperCase();

  return (
    <Menu>
      <MenuTrigger className={compact ? "s-account s-account--compact" : "s-account"} aria-label={`Account: ${name}, ${PLANS[plan].name} plan`}>
        <span className="s-avatar" aria-hidden>
          {initial}
        </span>
        {!compact && (
          <>
            <span className="s-account-meta">
              <span className="s-account-name">{name}</span>
              <span className="s-account-plan">{PLANS[plan].name} plan</span>
            </span>
            <ChevronsUpDown aria-hidden />
          </>
        )}
      </MenuTrigger>
      <MenuContent side={compact ? "bottom" : "top"} align={compact ? "end" : "start"} sideOffset={compact ? 10 : 4} style={{ minWidth: 220 }}>
        {compact && (
          <>
            <div className="s-menu-head">
              <b>{name}</b>
              <span>{PLANS[plan].name} plan</span>
            </div>
            <MenuSeparator />
          </>
        )}
        <MenuItem href="/settings">
          <Settings aria-hidden />
          <span>Settings</span>
        </MenuItem>
        {compact && upgrade && (
          <MenuItem href={upgrade.href} end={<span className="s-link">See plans</span>}>
            <ArrowUpRight aria-hidden />
            <span>Upgrade to {upgrade.name}</span>
          </MenuItem>
        )}
        <MenuSeparator />
        <form action="/auth/signout" method="post">
          <MenuItem render={<button type="submit" />}>
            <LogOut aria-hidden />
            <span>Log out</span>
          </MenuItem>
        </form>
      </MenuContent>
    </Menu>
  );
}
