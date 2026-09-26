"use client";

// The account switcher. It lists the Instagram accounts actually connected to
// this user, switches which one is active (every page reads through the
// active account, so a switch changes the whole app), and gates adding
// accounts by the plan's Brand Workspace limit (one Instagram account per
// workspace). The limit and plan names come from /api/accounts, never from here.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Check, Camera, Plus, Gem, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu";

type Account = {
  ig_user_id: string | null;
  username: string | null;
  is_active: boolean;
  /** Paused by a plan downgrade: shown, but not switchable. */
  suspended?: boolean;
  avatar: string | null;
};

export default function AccountSwitcher() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [limit, setLimit] = useState(1);
  const [nextPlanName, setNextPlanName] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/accounts")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j) return;
        setAccounts(j.accounts ?? []);
        setLimit(j.limit ?? 1);
        setNextPlanName(typeof j.nextPlanName === "string" ? j.nextPlanName : null);
      })
      .catch(() => alive && setAccounts([]));
    return () => {
      alive = false;
    };
  }, []);

  // Nothing connected (or still loading): no switcher to show.
  if (!accounts || accounts.length === 0) return null;

  const active = accounts.find((a) => a.is_active) ?? accounts[0];

  async function switchTo(a: Account) {
    // A paused row cannot become the active account; the server refuses it too.
    if (!a.ig_user_id || a.is_active || a.suspended || switching) return;
    setSwitching(a.ig_user_id);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ig_user_id: a.ig_user_id }),
      });
      if (res.ok) {
        setAccounts((xs) =>
          (xs ?? []).map((x) => ({ ...x, is_active: x.ig_user_id === a.ig_user_id })),
        );
        router.refresh();
      }
    } finally {
      setSwitching(null);
    }
  }

  // Paused rows hold no plan slot, so they do not count toward the cap here.
  const canAdd = accounts.filter((a) => !a.suspended).length < limit;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="pill-btn" aria-label="Switch account">
        {active.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={active.avatar} alt="" width={16} height={16} className="acsw-avatar" />
        ) : (
          <Camera size={15} />
        )}
        {active.username ? `@${active.username}` : "Account"}
        <ChevronDown size={14} className="drop-chev" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Instagram accounts</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {accounts.map((a) => (
            <DropdownMenuItem
              key={a.ig_user_id ?? a.username ?? "?"}
              onClick={() => switchTo(a)}
              disabled={Boolean(a.suspended)}
              className="gap-2"
            >
              {a.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.avatar} alt="" width={18} height={18} className="acsw-avatar" />
              ) : (
                <Camera size={15} />
              )}
              <span className="flex-1">@{a.username ?? "unknown"}</span>
              {a.suspended ? (
                <DropdownMenuShortcut>Paused</DropdownMenuShortcut>
              ) : switching === a.ig_user_id ? (
                <Loader2 size={14} className="acsw-spin" />
              ) : (
                a.is_active && <Check size={14} />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {canAdd ? (
            <DropdownMenuItem
              className="gap-2"
              onClick={() => {
                window.location.href = "/api/auth/instagram/start";
              }}
            >
              <Plus size={15} />
              <span className="flex-1">Add Instagram account</span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              className="gap-2"
              onClick={() => {
                window.location.href = "/settings#plan";
              }}
            >
              <Gem size={14} />
              <span className="flex-1">
                {nextPlanName ? `More workspaces with ${nextPlanName}` : `Workspace limit reached (${limit})`}
              </span>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
