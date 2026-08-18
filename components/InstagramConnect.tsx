"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";

const IG_LOGO = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="1.2" fill="#fff" stroke="none" />
  </svg>
);

export default function InstagramConnect({
  username,
  status,
}: {
  username: string | null;
  status?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function disconnect() {
    setBusy(true);
    try {
      await fetch("/api/auth/instagram/disconnect", { method: "POST" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const note =
    status === "denied"
      ? "Connection cancelled — you didn't approve access."
      : status === "notconfigured"
        ? "Instagram isn't configured on the server yet (missing app credentials)."
        : status === "error"
          ? "Something went wrong connecting Instagram. Please try again."
          : null;

  return (
    <div className="ig-connect">
      <div className="ig-connect-row">
        <span className="ig-connect-logo">{IG_LOGO}</span>
        <div className="ig-connect-meta">
          <b>Instagram</b>
          {username ? (
            <small className="ig-connect-live">
              <Check size={13} /> Connected as @{username}
            </small>
          ) : (
            <small>Connect a professional account to pull your real insights.</small>
          )}
        </div>
        {username ? (
          <button className="btn-secondary" onClick={disconnect} disabled={busy}>
            {busy ? <Loader2 size={15} className="spin" /> : "Disconnect"}
          </button>
        ) : (
          <a className="btn-primary" href="/api/auth/instagram/start">
            Connect
          </a>
        )}
      </div>
      {note && <p className="ig-connect-note">{note}</p>}
    </div>
  );
}
