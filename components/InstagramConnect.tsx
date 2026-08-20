"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, RefreshCw } from "lucide-react";

const IG_LOGO = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="1.2" fill="#fff" stroke="none" />
  </svg>
);

function ago(iso: string | null): string | null {
  if (!iso) return null;
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function InstagramConnect({
  username,
  status,
  syncedAt = null,
  followers = null,
}: {
  username: string | null;
  status?: string;
  syncedAt?: string | null;
  followers?: number | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);

  async function disconnect() {
    setBusy(true);
    try {
      await fetch("/api/auth/instagram/disconnect", { method: "POST" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    setSyncing(true);
    try {
      await fetch("/api/instagram/sync", { method: "POST" });
      router.refresh();
    } finally {
      setSyncing(false);
    }
  }

  const note =
    status === "denied"
      ? "Connection cancelled. You didn't approve access."
      : status === "notconfigured"
        ? "Instagram isn't configured on the server yet (missing app credentials)."
        : status === "error"
          ? "Something went wrong connecting Instagram. Please try again."
          : null;

  const synced = ago(syncedAt);

  return (
    <div className="ig-connect">
      <div className="ig-connect-row">
        <span className="ig-connect-logo">{IG_LOGO}</span>
        <div className="ig-connect-meta">
          <b>Instagram</b>
          {username ? (
            <small className="ig-connect-live">
              <Check size={13} /> Connected as @{username}
              {followers != null && <> · {followers.toLocaleString()} followers</>}
              {synced && <> · synced {synced}</>}
            </small>
          ) : (
            <small>Connect a professional account to pull your real insights.</small>
          )}
        </div>
        {username ? (
          <>
            <button className="btn-secondary" onClick={syncNow} disabled={syncing || busy}>
              {syncing ? <Loader2 size={15} className="spin" /> : <><RefreshCw size={14} /> Sync now</>}
            </button>
            <button className="btn-secondary" onClick={disconnect} disabled={busy || syncing}>
              {busy ? <Loader2 size={15} className="spin" /> : "Disconnect"}
            </button>
          </>
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
