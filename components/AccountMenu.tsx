"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Settings, LogOut, ChevronsUpDown } from "lucide-react";

export default function AccountMenu({
  email,
  plan = "free",
}: {
  email?: string | null;
  /** The user's real plan — never assumed. */
  plan?: "free" | "pro";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
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
    <div className="acct" ref={ref}>
      {open && (
        <div className="acct-menu" role="menu">
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
          <span className="acct-plan">{plan === "pro" ? "Pro plan" : "Free plan"}</span>
        </span>
        <ChevronsUpDown size={15} className="acct-chev" />
      </button>
    </div>
  );
}
