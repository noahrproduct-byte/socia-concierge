"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, RefreshCw } from "lucide-react";

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
    <div className="st2-ig">
      <div className="st2-ig-row">
        <span className="st2-ig-logo" aria-hidden>
          {IG_LOGO}
        </span>
        <div className="st2-ig-meta">
          <b>Instagram</b>
          {username ? (
            <>
              <small className="st2-ig-live">
                <i className="st2-live-dot" /> Connected as @{username}
                {followers != null && <> · {followers.toLocaleString()} followers</>}
              </small>
              {synced && <small className="st2-ig-sync">Synced {synced}</small>}
            </>
          ) : (
            <small className="st2-ig-off">
              Not connected — connect a professional account to pull your real insights.
            </small>
          )}
        </div>
        <div className="st2-ig-actions">
          {username ? (
            <>
              <button className="st2-btn" onClick={syncNow} disabled={syncing || busy} type="button">
                <RefreshCw size={14} className={syncing ? "spin" : undefined} />
                {syncing ? "Syncing…" : "Sync now"}
              </button>
              <button
                className="st2-btn danger"
                onClick={disconnect}
                disabled={busy || syncing}
                type="button"
              >
                {busy ? <Loader2 size={14} className="spin" /> : "Disconnect"}
              </button>
            </>
          ) : (
            <a className="st2-connect" href="/api/auth/instagram/start">
              Connect <ArrowRight size={13} />
            </a>
          )}
        </div>
      </div>
      {note && <p className="st2-ig-note">{note}</p>}
    </div>
  );
}
