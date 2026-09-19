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

async function apiError(res: Response, fallback: string): Promise<string> {
  const j = await res.json().catch(() => null);
  return (j && typeof j.error === "string" && j.error) || fallback;
}

export default function InstagramConnect({
  username,
  status,
  syncedAgo = null,
  followers = null,
  avatar = null,
  needsReconnect = false,
}: {
  username: string | null;
  status?: string;
  /** "Synced ..." wording computed by the server page, so it renders identically on both sides. */
  syncedAgo?: string | null;
  followers?: number | null;
  /** Real profile picture from the connected account, when synced. */
  avatar?: string | null;
  /** True when the stored token lacks the insights permission. */
  needsReconnect?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function disconnect() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/auth/instagram/disconnect", { method: "POST" });
      if (!res.ok) throw new Error(await apiError(res, "Couldn't disconnect Instagram, try again."));
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Couldn't disconnect Instagram, try again.");
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    setSyncing(true);
    setErr(null);
    try {
      const res = await fetch("/api/instagram/sync", { method: "POST" });
      if (!res.ok) throw new Error(await apiError(res, "Sync failed, try again in a minute."));
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Sync failed, try again in a minute.");
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
          : status === "limit"
            ? "That's a new account beyond your plan's limit. Pro connects up to 3 Instagram accounts."
            : null;

  return (
    <div className="st2-ig">
      <div className="st2-ig-row">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="st2-ig-avatar" src={avatar} alt="" width={44} height={44} />
        ) : (
          <span className="st2-ig-logo" aria-hidden>
            {IG_LOGO}
          </span>
        )}
        <div className="st2-ig-meta">
          <b>Instagram</b>
          {username ? (
            <>
              <small className="st2-ig-live">
                <i className="st2-live-dot" /> Connected as @{username}
                {followers != null && <> · {followers.toLocaleString("en-US")} followers</>}
              </small>
              {syncedAgo && <small className="st2-ig-sync">Synced {syncedAgo}</small>}
            </>
          ) : (
            <small className="st2-ig-off">
              Not connected. Connect a professional account to pull your real insights.
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
      {err && <p className="st2-ig-note" role="alert">{err}</p>}
      {username && needsReconnect && (
        <p className="st2-ig-note">
          Your Instagram connection predates full analytics permissions.{" "}
          <a href="/api/auth/instagram/start" className="st2-ig-reconnect">
            Reconnect to enable full analytics <ArrowRight size={12} />
          </a>
        </p>
      )}
    </div>
  );
}
