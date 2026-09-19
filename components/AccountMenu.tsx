"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Settings, LogOut, ChevronsUpDown, Sun, Moon, SunMoon } from "lucide-react";
import { useTheme, type Appearance } from "@/components/ThemeProvider";

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
  plan?: "free" | "pro";
  /** Where the menu opens relative to the trigger (sidebar: above; top bar: below). */
  placement?: "above" | "below";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
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

  // Escape closes the menu and hands focus back to the trigger.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className={`acct ${placement}`} ref={ref}>
      {open && (
        // A dialog, not a menu: it holds a radiogroup and a form, which the
        // menu role does not allow.
        <div className={`acct-menu ${placement}`} role="dialog" aria-label="Account" id={menuId}>
          {/* quick appearance switch; Settings → Appearance is the full control */}
          <div className="acct-appearance">
            <span id={`${menuId}-appearance`}>Appearance</span>
            <span className="acct-seg" role="radiogroup" aria-labelledby={`${menuId}-appearance`}>
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
          <Link href="/settings" className="acct-item" onClick={() => setOpen(false)}>
            <Settings size={15} /> Settings
          </Link>
          <form action="/auth/signout" method="post">
            <button className="acct-item danger" type="submit">
              <LogOut size={15} /> Log out
            </button>
          </form>
        </div>
      )}
      <button
        type="button"
        className="acct-trigger"
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        // The visible pieces have no spacing between them, so the computed
        // name would read "Oovernight qaFree plan". Spell it out instead.
        aria-label={`Account menu: ${name}, ${plan === "pro" ? "Pro plan" : "Free plan"}`}
      >
        <span className="acct-avatar" aria-hidden>{initial}</span>
        <span className="acct-meta">
          <span className="acct-name">{name}</span>
          <span className="acct-plan">{plan === "pro" ? "Pro plan" : "Free plan"}</span>
        </span>
        <ChevronsUpDown size={15} className="acct-chev" />
      </button>
    </div>
  );
}
