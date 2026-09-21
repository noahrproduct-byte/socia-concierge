"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import BrandMark from "./BrandMark";

// Nav and footer for public marketing pages other than the landing. Same
// classes and structure as the landing's inline chrome (CinematicLanding), so
// /pricing reads as the same site without importing that page.

const NAV_LINKS: { href: string; label: string }[] = [
  { href: "/", label: "Home" },
  { href: "/pricing", label: "Pricing" },
];

export function Nav({ signedIn, current }: { signedIn: boolean; current?: string }) {
  const [menu, setMenu] = useState(false);
  return (
    <>
      <header className="so-nav on-dark pr-nav">
        <Link href="/" className="so-brand"><BrandMark size={26} /> SOCIA</Link>
        <nav className="so-nav-links" aria-label="Pages">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="pr-nav-link" aria-current={current === l.href ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="so-nav-right">
          {signedIn ? (
            <Link href="/dashboard" className="so-btn so-btn-blue sm">Dashboard <ArrowRight size={14} /></Link>
          ) : (
            <>
              <Link href="/login" className="so-login">Log in</Link>
              <Link href="/signup" className="so-btn so-btn-blue sm">Sign up <ArrowRight size={14} /></Link>
            </>
          )}
          <button className="so-menu-btn" onClick={() => setMenu(!menu)} aria-label="Menu" aria-expanded={menu}>
            {menu ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>
      {menu && (
        <div className="so-mobile-menu">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setMenu(false)}>{l.label}</Link>
          ))}
          {signedIn ? (
            <Link href="/dashboard" className="so-btn so-btn-blue">Dashboard <ArrowRight size={15} /></Link>
          ) : (
            <>
              <Link href="/login">Log in</Link>
              <Link href="/signup" className="so-btn so-btn-blue">Sign up <ArrowRight size={15} /></Link>
            </>
          )}
        </div>
      )}
    </>
  );
}

export function Footer() {
  return (
    <footer className="so-footer">
      <div className="so-footer-grid">
        <div className="so-footer-brand">
          <span className="so-brand"><BrandMark size={26} /> SOCIA</span>
          <p>AI social intelligence for creators and teams.</p>
        </div>
        <div>
          <small>PRODUCT</small>
          <Link href="/">Home</Link>
          <Link href="/pricing">Pricing</Link>
        </div>
        <div>
          <small>ACCOUNT</small>
          <Link href="/login">Log in</Link>
          <Link href="/signup">Sign up</Link>
          <Link href="/settings">Settings</Link>
        </div>
        <div>
          <small>LEGAL</small>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </div>
      </div>
      <div className="so-footer-copy">© 2026 SOCIA. All rights reserved.</div>
    </footer>
  );
}
