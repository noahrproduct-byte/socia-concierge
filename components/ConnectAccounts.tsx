"use client";

import { Check } from "lucide-react";

// Real OAuth to Instagram/TikTok/YouTube is gated on platform API approval.
// Until that lands, connecting registers the account in-app (drives the
// dashboard's connected state and tailors the AI) — live data sync arrives
// once the platform APIs are approved.

type Account = { id: string; label: string; sub: string; color: string; logo: React.ReactNode };

const ACCOUNTS: Account[] = [
  {
    id: "Instagram",
    label: "Instagram",
    sub: "Connect a professional account",
    color: "#E1306C",
    logo: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1.2" fill="#fff" stroke="none" />
      </svg>
    ),
  },
  {
    id: "TikTok",
    label: "TikTok",
    sub: "Connect a personal or business account",
    color: "#111",
    logo: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="#fff">
        <path d="M16.5 3c.3 2 1.6 3.6 3.5 3.9v2.6c-1.3 0-2.5-.4-3.5-1v5.9a5.5 5.5 0 1 1-5.5-5.5c.3 0 .6 0 .9.1v2.7a2.8 2.8 0 1 0 2 2.7V3h2.6Z" />
      </svg>
    ),
  },
  {
    id: "YouTube",
    label: "YouTube",
    sub: "Connect a channel",
    color: "#FF0000",
    logo: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="#fff">
        <path d="M12 6c-3 0-6 .2-6 .2-.7.1-1.3.7-1.4 1.4C4.4 8.5 4.3 10 4.3 12s.1 3.5.3 4.4c.1.7.7 1.3 1.4 1.4 0 0 3 .2 6 .2s6-.2 6-.2c.7-.1 1.3-.7 1.4-1.4.2-.9.3-2.4.3-4.4s-.1-3.5-.3-4.4a1.9 1.9 0 0 0-1.4-1.4S15 6 12 6Zm-1.5 3.3 4 2.7-4 2.7V9.3Z" />
      </svg>
    ),
  },
  {
    id: "X",
    label: "X / Twitter",
    sub: "Connect an X account",
    color: "#111",
    logo: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="#fff">
        <path d="M17.5 3h3l-6.6 7.5L21.7 21h-6l-4.7-6-5.4 6H2.6l7-8L2.2 3h6.1l4.2 5.6L17.5 3Zm-1 16h1.6L7.6 4.7H5.9L16.5 19Z" />
      </svg>
    ),
  },
  {
    id: "LinkedIn",
    label: "LinkedIn",
    sub: "Connect a profile or page",
    color: "#0A66C2",
    logo: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="#fff">
        <path d="M6.5 8.5v9H4v-9h2.5ZM5.2 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM20 17.5h-2.5v-4.7c0-1.2-.4-2-1.5-2-.8 0-1.3.6-1.5 1.1-.1.2-.1.5-.1.8v4.8H11.9s.1-8.1 0-9h2.5v1.3c.3-.5 1-1.3 2.4-1.3 1.7 0 3.2 1.1 3.2 3.6v5.4Z" />
      </svg>
    ),
  },
  {
    id: "Facebook",
    label: "Facebook",
    sub: "Connect a page",
    color: "#1877F2",
    logo: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="#fff">
        <path d="M13.5 21v-7h2.3l.4-2.7h-2.7V9.6c0-.8.2-1.3 1.3-1.3h1.4V5.9c-.2 0-1.1-.1-2-.1-2 0-3.4 1.2-3.4 3.5v1.9H8.5V14h2.3v7h2.7Z" />
      </svg>
    ),
  },
];

export default function ConnectAccounts({
  connected,
  onToggle,
}: {
  connected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="conn-grid">
      {ACCOUNTS.map((a) => {
        const on = connected.includes(a.id);
        return (
          <button
            type="button"
            key={a.id}
            className={`conn-card${on ? " on" : ""}`}
            onClick={() => onToggle(a.id)}
          >
            <span className="conn-logo" style={{ background: a.color }}>{a.logo}</span>
            <span className="conn-meta">
              <span className="conn-name">{a.label}</span>
              <span className="conn-sub">{a.sub}</span>
            </span>
            <span className={`conn-btn${on ? " on" : ""}`}>
              {on ? (<><Check size={14} /> Connected</>) : "Connect"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
