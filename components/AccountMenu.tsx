"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Settings, LogOut, ChevronsUpDown, Sun, Moon, SunMoon } from "lucide-react";
import { useTheme, type Appearance } from "@/components/ThemeProvider";
import { PLANS, type PlanId } from "@/lib/plans";

const APPEARANCES: { value: Appearance; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: SunMoon },
];

export default function AccountMenu({
  email,
  plan = "free",
  placement = "above",
}: {
  email?: string | null;
  /** The user's real plan — never assumed. */
  plan?: PlanId;
  /** Where the menu opens relative to the trigger (sidebar: above; top bar: below). */
  placement?: "above" | "below";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { appearance, setAppearance, ready } = useTheme();
  const name = (email?.split("@")[0] ?? "account").replace(/[._-]+/g, " ");
  const initial = (email?.[0] ?? "?").toUpperCase();

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className={`acct ${placement}`} ref={ref}>
      {open && (
        <div className={`acct-menu ${placement}`} role="menu">
          {/* quick appearance switch; Settings → Appearance is the full control */}
          <div className="acct-appearance">
            <span>Appearance</span>
            <span className="acct-seg" role="radiogroup" aria-label="Appearance">
              {APPEARANCES.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={ready && appearance === value}
                  aria-label={label}
                  title={label}
                  className={ready && appearance === value ? "on" : ""}
                  onClick={() => setAppearance(value)}
                >
                  <Icon size={13} />
                </button>
              ))}
            </span>
          </div>
          <Link href="/settings" className="acct-item" role="menuitem" onClick={() => setOpen(false)}>
            <Settings size={15} /> Settings
          </Link>
          <form action="/auth/signout" method="post">
            <button className="acct-item danger" type="submit" role="menuitem">
              <LogOut size={15} /> Log out
            </button>
          </form>
        </div>
      )}
      <button
        className="acct-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="acct-avatar">{initial}</span>
        <span className="acct-meta">
          <span className="acct-name">{name}</span>
          <span className="acct-plan">{placement === "below" ? "Business Account" : `${PLANS[plan].name} plan`}</span>
        </span>
        <ChevronsUpDown size={15} className="acct-chev" />
      </button>
    </div>
  );
}
