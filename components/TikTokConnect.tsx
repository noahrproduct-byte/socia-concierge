"use client";

// TikTok account connection card for Settings. States: not configured (server
// has no client key/secret), paused by plan, disconnected, connected. Tokens
// never reach this component; it only sees the account's public summary.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";

const TT_LOGO = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="#fff" aria-hidden>
    <path d="M16.6 5.8a4.3 4.3 0 0 1-1-2.8h-3.1v12.6a2.6 2.6 0 0 1-2.6 2.5 2.6 2.6 0 0 1-2.6-2.6 2.6 2.6 0 0 1 3.4-2.5V9.8a5.8 5.8 0 0 0-.8 0 5.7 5.7 0 0 0-5.7 5.7 5.7 5.7 0 0 0 5.7 5.7 5.7 5.7 0 0 0 5.7-5.7V9.3a7.4 7.4 0 0 0 4.3 1.4V7.6a4.3 4.3 0 0 1-3.3-1.8Z" />
  </svg>
);

export default function TikTokConnect({
  status,
  configured,
  displayName,
  username,
  followers,
  avatar,
  paused = false,
  canPublishDirect = false,
}: {
  /** OAuth outcome from ?tt= (connected/denied/noprofile/error/notconfigured/limit). */
  status?: string;
  /** Whether the server has TIKTOK_CLIENT_KEY/SECRET to run the flow. */
  configured: boolean;
  displayName: string | null;
  username: string | null;
  followers: number | null;
  avatar: string | null;
  paused?: boolean;
  /** True when the grant includes video.publish (posts go live directly); otherwise uploads land in the TikTok inbox. */
  canPublishDirect?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const connected = Boolean(displayName) && !paused;

  async function disconnect() {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/tiktok/disconnect", { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || "Couldn't disconnect. Try again.");
      }
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Couldn't disconnect. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const note =
    status === "denied"
      ? "No account was connected. You cancelled the authorization."
      : status === "noprofile"
        ? "TikTok did not return a profile for that account. Please try again."
        : status === "notconfigured"
          ? "TikTok is not configured on the server yet."
          : status === "error"
            ? "Something went wrong connecting TikTok. Please try again."
            : null;
  // ?tt=limit is rendered once, by the page-level PlanNotice above the cards.

  return (
    <div className="st2-ig">
      <div className="st2-ig-row">
        {connected && avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="st2-ig-avatar" src={avatar} alt="" width={44} height={44} />
        ) : (
          <span className="st2-ig-logo tt" aria-hidden>
            {TT_LOGO}
          </span>
        )}
        <div className="st2-ig-meta">
          <b>TikTok</b>
          {connected ? (
            <small className="st2-ig-live">
              <i className="st2-live-dot" /> Connected. {displayName}
              {username && <> · @{username}</>}
              {followers != null && <> · {followers.toLocaleString("en-US")} followers</>}
            </small>
          ) : paused ? (
            <small className="st2-ig-off">
              Paused by your plan{displayName ? <> ({displayName})</> : null}. Choose which accounts stay active in Plan &amp; billing.
            </small>
          ) : configured ? (
            <small className="st2-ig-off">
              Not connected. Link your account to bring in your videos and stats, and schedule posts from the Studio.
            </small>
          ) : (
            <small className="st2-ig-off">TikTok connection is coming soon.</small>
          )}
        </div>
        <div className="st2-ig-actions">
          {paused ? (
            <a className="st2-connect" href="#plan">
              Plan &amp; billing <ArrowRight size={13} />
            </a>
          ) : connected ? (
            <button className="st2-btn danger" type="button" onClick={disconnect} disabled={busy}>
              {busy ? <Loader2 size={14} className="spin" /> : "Disconnect"}
            </button>
          ) : configured ? (
            <a className="st2-connect" href="/api/auth/tiktok/start">
              Connect <ArrowRight size={13} />
            </a>
          ) : null}
        </div>
      </div>
      {connected && !canPublishDirect && (
        <p className="st2-ig-note">
          Scheduled videos are sent to your TikTok inbox as drafts; you add the final touches and post from the TikTok app.
        </p>
      )}
      {note && <p className="st2-ig-note">{note}</p>}
      {err && <p className="st2-ig-note">{err}</p>}
    </div>
  );
}
