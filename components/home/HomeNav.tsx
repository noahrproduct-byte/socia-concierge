"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import BrandMark from "@/components/BrandMark";

// The homepage's top bar: brand, section links, log in and the one primary
// action. On phones the section links fold into a menu under the bar.

const LINKS = [
  { href: "#product", label: "Product" },
  { href: "#how", label: "How it works" },
  { href: "#platforms", label: "Platforms" },
  { href: "/pricing", label: "Pricing" },
];

export default function HomeNav({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="hm-nav">
      <div className="hm-wrap">
        <div className="hm-nav-in">
          <Link href="/" className="hm-brand" aria-label="SOCIA home">
            <BrandMark size={22} /> SOCIA
          </Link>
          <nav className="hm-nav-links" aria-label="Sections">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href}>
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="hm-nav-actions">
            {signedIn ? (
              <Link href="/dashboard" className="hm-btn hm-btn--primary hm-btn--sm">
                Open your dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" className="hm-btn hm-btn--ghost hm-btn--sm">
                  Log in
                </Link>
                <Link href="/signup" className="hm-btn hm-btn--primary hm-btn--sm">
                  Sign up free
                </Link>
              </>
            )}
            <button
              type="button"
              className="hm-nav-toggle"
              aria-expanded={open}
              aria-controls="hm-nav-menu"
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => setOpen((o) => !o)}
            >
              {open ? <X aria-hidden /> : <Menu aria-hidden />}
            </button>
          </div>
        </div>
        <nav id="hm-nav-menu" className={`hm-nav-menu${open ? " is-open" : ""}`} aria-label="Sections" hidden={!open}>
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)}>
              {l.label}
            </Link>
          ))}
          {!signedIn && (
            <Link href="/login" onClick={() => setOpen(false)}>
              Log in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
