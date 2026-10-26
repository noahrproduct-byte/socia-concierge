"use client";

// The Instagram account switcher. It lists the Instagram accounts actually
// connected to this user, switches which one is active (every page reads
// through the active account, so a switch changes the whole app), and gates
// adding accounts by the plan's Brand Workspace limit (one Instagram account
// per workspace). The limit and plan names come from /api/accounts.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, ChevronDown, Gem, Loader2, Plus } from "lucide-react";
import { Menu, MenuContent, MenuGroup, MenuItem, MenuSeparator, MenuTrigger } from "@/components/system";

type Account = {
  ig_user_id: string | null;
  username: string | null;
  is_active: boolean;
  /** Paused by a plan downgrade: shown, but not switchable. */
  suspended?: boolean;
  avatar: string | null;
};

function Avatar({ src, size = 16 }: { src: string | null; size?: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} style={{ width: size, height: size, borderRadius: "var(--r-pill)", flex: "none" }} />
  ) : (
    <Camera aria-hidden />
  );
}

/** `label`: render inside a labelled query-bar item; the label disappears with the control when nothing is connected. */
export default function AccountSwitcher({ label }: { label?: string } = {}) {
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
        setAccounts((xs) => (xs ?? []).map((x) => ({ ...x, is_active: x.ig_user_id === a.ig_user_id })));
        router.refresh();
      }
    } finally {
      setSwitching(null);
    }
  }

  // Paused rows hold no plan slot, so they do not count toward the cap here.
  const canAdd = accounts.filter((a) => !a.suspended).length < limit;

  const menu = (
    <Menu>
      <MenuTrigger className="s-btn s-btn--secondary" aria-label={`Instagram account: @${active.username ?? "unknown"}. Switch account`}>
        <Avatar src={active.avatar} />
        {active.username ? `@${active.username}` : "Account"}
        <ChevronDown aria-hidden />
      </MenuTrigger>
      <MenuContent align="start" style={{ minWidth: 240 }}>
        <MenuGroup label="Instagram accounts">
          {accounts.map((a) => (
            <MenuItem
              key={a.ig_user_id ?? a.username ?? "?"}
              onClick={() => void switchTo(a)}
              disabled={Boolean(a.suspended)}
              why={a.suspended ? "Paused" : undefined}
              end={switching === a.ig_user_id ? <Loader2 className="s-spin" aria-hidden /> : a.is_active ? <Check aria-label="Active" /> : undefined}
            >
              <Avatar src={a.avatar} size={18} />
              <span>@{a.username ?? "unknown"}</span>
            </MenuItem>
          ))}
        </MenuGroup>
        <MenuSeparator />
        {canAdd ? (
          <MenuItem href="/api/auth/instagram/start">
            <Plus aria-hidden />
            <span>Add Instagram account</span>
          </MenuItem>
        ) : (
          <MenuItem href="/settings#plan">
            <Gem aria-hidden />
            <span>{nextPlanName ? `More workspaces with ${nextPlanName}` : `Workspace limit reached (${limit})`}</span>
          </MenuItem>
        )}
      </MenuContent>
    </Menu>
  );
  if (!label) return menu;
  return (
    <div className="s-query-item">
      <small>{label}</small>
      {menu}
    </div>
  );
}
