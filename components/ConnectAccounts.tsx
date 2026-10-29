"use client";

import { Check } from "lucide-react";

// The platforms SOCIA really connects, each through its own OAuth flow. There
// is no "register" toggle: a platform is either connected (read from the
// connection row on the server), connectable (a link to its start route), or
// not set up on this deployment, said plainly with no button.

type Mark = (color: string, size?: number) => React.ReactNode;
type Account = { id: string; name: string; cta: string; color: string; mark: Mark };

export const ACCOUNTS: Account[] = [
  {
    id: "Instagram",
    name: "Instagram",
    cta: "Connect an Instagram professional account",
    color: "#E1306C",
    mark: (c, s = 20) => (
      <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke={c} strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1.2" fill={c} stroke="none" />
      </svg>
    ),
  },
  {
    id: "TikTok",
    name: "TikTok",
    cta: "Connect a TikTok account",
    color: "#111",
    mark: (c, s = 20) => (
      <svg viewBox="0 0 24 24" width={s} height={s} fill={c}>
        <path d="M16.5 3c.3 2 1.6 3.6 3.5 3.9v2.6c-1.3 0-2.5-.4-3.5-1v5.9a5.5 5.5 0 1 1-5.5-5.5c.3 0 .6 0 .9.1v2.7a2.8 2.8 0 1 0 2 2.7V3h2.6Z" />
      </svg>
    ),
  },
  {
    id: "Facebook",
    name: "Facebook",
    cta: "Connect a Facebook page",
    color: "#1877F2",
    mark: (c, s = 20) => (
      <svg viewBox="0 0 24 24" width={s} height={s} fill={c}>
        <path d="M13.5 21v-7h2.3l.4-2.7h-2.7V9.6c0-.8.2-1.3 1.3-1.3h1.4V5.9c-.2 0-1.1-.1-2-.1-2 0-3.4 1.2-3.4 3.5v1.9H8.5V14h2.3v7h2.7Z" />
      </svg>
    ),
  },
  {
    id: "YouTube",
    name: "YouTube",
    cta: "Connect a YouTube channel",
    color: "#FF0000",
    mark: (c, s = 22) => (
      <svg viewBox="0 0 24 24" width={s} height={s} fill={c}>
        <path d="M12 6c-3 0-6 .2-6 .2-.7.1-1.3.7-1.4 1.4C4.4 8.5 4.3 10 4.3 12s.1 3.5.3 4.4c.1.7.7 1.3 1.4 1.4 0 0 3 .2 6 .2s6-.2 6-.2c.7-.1 1.3-.7 1.4-1.4.2-.9.3-2.4.3-4.4s-.1-3.5-.3-4.4a1.9 1.9 0 0 0-1.4-1.4S15 6 12 6Zm-1.5 3.3 4 2.7-4 2.7V9.3Z" />
      </svg>
    ),
  },
];

export type ConnectState = {
  id: string;
  /** Start route for this platform's OAuth, or null when it isn't configured here. */
  href: string | null;
  /** The connected account's name or handle, or null when not connected. */
  connectedAs: string | null;
};

export default function ConnectAccounts({ states }: { states: ConnectState[] }) {
  return (
    <ul className="conn-list ob-conn">
      {states.map((st) => {
        const a = ACCOUNTS.find((x) => x.id === st.id);
        if (!a) return null;
        return (
          <li className="conn-row" key={a.id}>
            <span className="conn-icon" aria-hidden>{a.mark(a.color, 18)}</span>
            <span className="conn-name">
              <b>{a.name}</b>
              <small className={`conn-status${st.connectedAs ? " on" : ""}`}>
                {st.connectedAs
                  ? `Connected as ${st.connectedAs}`
                  : st.href
                    ? "Not connected"
                    : "Not available on this site yet"}
              </small>
            </span>
            {st.connectedAs ? (
              <Check size={16} className="conn-done" aria-label="Connected" />
            ) : st.href ? (
              <a className="conn-btn" href={st.href}>Connect</a>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
