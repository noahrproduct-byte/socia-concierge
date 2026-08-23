"use client";

// Settings sub-navigation: anchor links with scroll-position highlighting.

import { useEffect, useState } from "react";
import {
  UserRound,
  Share2,
  Sparkle,
  Radar,
  Sparkles,
  Bell,
  CreditCard,
  Lock,
  type LucideIcon,
} from "lucide-react";

type Item = { id: string; label: string; Icon: LucideIcon };
type Group = { label: string; items: Item[] };

const GROUPS: Group[] = [
  {
    label: "Workspace",
    items: [
      { id: "brand", label: "Profile & Brand", Icon: UserRound },
      { id: "accounts", label: "Connected Accounts", Icon: Share2 },
      { id: "intel", label: "SOCIA Intelligence", Icon: Sparkle },
      { id: "market", label: "Competitors & Market", Icon: Radar },
      { id: "strategist", label: "AI Strategist", Icon: Sparkles },
    ],
  },
  {
    label: "Preferences",
    items: [{ id: "notifications", label: "Notifications & Reports", Icon: Bell }],
  },
  {
    label: "Account",
    items: [
      { id: "plan", label: "Plan & Billing", Icon: CreditCard },
      { id: "security", label: "Security & Privacy", Icon: Lock },
    ],
  },
];

export default function SettingsNav() {
  const [active, setActive] = useState("brand");

  useEffect(() => {
    const ids = GROUPS.flatMap((g) => g.items.map((i) => i.id));
    const sections = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!sections.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        // Highlight the topmost visible section.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-15% 0px -65% 0px" }
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  return (
    <nav className="st3-nav" aria-label="Settings sections">
      {GROUPS.map((g) => (
        <div key={g.label}>
          <small className="st3-nav-group">{g.label}</small>
          {g.items.map(({ id, label, Icon }) => (
            <a key={id} href={`#${id}`} className={`st3-nav-link${active === id ? " on" : ""}`}>
              <Icon size={14} /> {label}
            </a>
          ))}
        </div>
      ))}
    </nav>
  );
}
