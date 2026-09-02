"use client";

// Facebook Page connection card for Settings. States: disconnected,
// choose-page (multi-Page managers), connected, expired (reconnect), plus
// friendly notes for every OAuth outcome. Tokens never reach this component.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, RefreshCw } from "lucide-react";

const FB_LOGO = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="#fff" aria-hidden>
    <path d="M13.5 21v-7h2.3l.4-2.7h-2.7V9.6c0-.8.2-1.3 1.3-1.3h1.4V5.9c-.2 0-1.1-.1-2-.1-2 0-3.4 1.2-3.4 3.5v1.9H8.5V14h2.3v7h2.7Z" />
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

export type FbPageOption = {
  id: string;
  name: string;
  followers: number | null;
  picture: string | null;
};

export default function FacebookConnect({
  status,
  connectionStatus,
  pageName,
  username,
  followers,
  picture,
  syncedAt,
  pendingPages,
}: {
  /** OAuth outcome from ?fb= (connected/denied/nopages/error/notconfigured/choose). */
  status?: string;
  /** connected | choose_page | expired | null (no connection row). */
  connectionStatus: string | null;
  pageName: string | null;
  username: string | null;
  followers: number | null;
  picture: string | null;
  syncedAt: string | null;
  pendingPages: FbPageOption[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function call(path: string, body?: unknown) {
    setErr(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || "Something went wrong — try again.");
      }
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Something went wrong — try again.");
    } finally {
      setBusy(null);
    }
  }

  const note =
    status === "denied"
      ? "No Facebook account was connected — you cancelled the authorization."
      : status === "nopages"
        ? "Facebook granted Page access but returned no Pages for this account. Check you're logged in as the account that manages the Page, and that the Page is listed under Page access."
        : status === "noperm"
          ? "Facebook didn't grant Page permissions. This app uses Facebook Login for Business, so permissions come from the login configuration in the Meta dashboard, not from SOCIA — add pages_show_list, pages_read_engagement and instagram_basic to that configuration, then reconnect."
        : status === "notconfigured"
          ? "Facebook isn't configured on the server yet (missing app credentials)."
          : status === "error"
            ? "Something went wrong connecting Facebook. Please try again."
            : null;

  const synced = ago(syncedAt);
  const connected = connectionStatus === "connected" && pageName;
  const choosing = connectionStatus === "choose_page" && pendingPages.length > 0;
  const expired = connectionStatus === "expired";

  return (
    <div className="st2-ig">
      <div className="st2-ig-row">
        {connected && picture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="st2-ig-avatar" src={picture} alt="" width={44} height={44} />
        ) : (
          <span className="st2-ig-logo fb" aria-hidden>
            {FB_LOGO}
          </span>
        )}
        <div className="st2-ig-meta">
          <b>Facebook</b>
          {connected ? (
            <>
              <small className="st2-ig-live">
                <i className="st2-live-dot" /> Connected — {pageName}
                {username && <> · @{username}</>}
                {followers != null && <> · {followers.toLocaleString("en-US")} followers</>}
              </small>
              {synced && <small className="st2-ig-sync">Synced {synced}</small>}
            </>
          ) : expired ? (
            <small className="st2-ig-off">
              Facebook connection needs attention — the authorization expired.
            </small>
          ) : choosing ? (
            <small className="st2-ig-off">Choose which Page to connect below.</small>
          ) : (
            <small className="st2-ig-off">Not connected — connect a Facebook Page you manage.</small>
          )}
        </div>
        <div className="st2-ig-actions">
          {connected ? (
            <>
              <button
                className="st2-btn"
                onClick={() => { setBusy("sync"); call("/api/facebook/sync"); }}
                disabled={busy != null}
                type="button"
              >
                <RefreshCw size={14} className={busy === "sync" ? "spin" : undefined} />
                {busy === "sync" ? "Syncing…" : "Sync now"}
              </button>
              <button
                className="st2-btn danger"
                onClick={() => { setBusy("dc"); call("/api/auth/facebook/disconnect"); }}
                disabled={busy != null}
                type="button"
              >
                {busy === "dc" ? <Loader2 size={14} className="spin" /> : "Disconnect"}
              </button>
            </>
          ) : expired ? (
            <a className="st2-connect" href="/api/auth/facebook/start">
              Reconnect <ArrowRight size={13} />
            </a>
          ) : !choosing ? (
            <a className="st2-connect" href="/api/auth/facebook/start">
              Connect <ArrowRight size={13} />
            </a>
          ) : null}
        </div>
      </div>

      {choosing && (
        <div className="st3-fbpages">
          <small className="st3-sub">Choose a Facebook Page</small>
          {pendingPages.map((p) => (
            <div className="st3-fbpage" key={p.id}>
              {p.picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.picture} alt="" width={34} height={34} />
              ) : (
                <span className="st3-fbpage-ph" aria-hidden>{FB_LOGO}</span>
              )}
              <span className="st3-fbpage-meta">
                <b>{p.name}</b>
                {p.followers != null && <small>{p.followers.toLocaleString("en-US")} followers</small>}
              </span>
              <button
                className="st2-connect"
                type="button"
                disabled={busy != null}
                onClick={() => { setBusy(p.id); call("/api/auth/facebook/select", { page_id: p.id }); }}
              >
                {busy === p.id ? <Loader2 size={14} className="spin" /> : "Connect"}
              </button>
            </div>
          ))}
        </div>
      )}

      {note && <p className="st2-ig-note">{note}</p>}
      {err && <p className="st2-ig-note">{err}</p>}
    </div>
  );
}
