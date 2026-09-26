"use client";

// YouTube channel connection card for Settings. States: not configured (server
// has no OAuth credentials), disconnected, connected. Tokens never reach this
// component; it only ever sees the channel's public-facing summary.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";

const YT_LOGO = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="#fff" aria-hidden>
    <path d="M12 6c-3 0-6 .2-6 .2-.7.1-1.3.7-1.4 1.4C4.4 8.5 4.3 10 4.3 12s.1 3.5.3 4.4c.1.7.7 1.3 1.4 1.4 0 0 3 .2 6 .2s6-.2 6-.2c.7-.1 1.3-.7 1.4-1.4.2-.9.3-2.4.3-4.4s-.1-3.5-.3-4.4a1.9 1.9 0 0 0-1.4-1.4S15 6 12 6Zm-1.5 3.3 4 2.7-4 2.7V9.3Z" />
  </svg>
);

export default function YouTubeConnect({
  status,
  configured,
  channelTitle,
  handle,
  subscribers,
  avatar,
  paused = false,
  canUpload = true,
}: {
  /** OAuth outcome from ?yt= (connected/denied/nochannel/error/notconfigured/limit). */
  status?: string;
  /** Whether the server has GOOGLE_CLIENT_ID/SECRET to run the flow. */
  configured: boolean;
  channelTitle: string | null;
  handle: string | null;
  subscribers: number | null;
  avatar: string | null;
  /** The channel exists but is paused by a plan downgrade (not read, not counted). */
  paused?: boolean;
  /** False when the stored OAuth scopes predate the upload scope: the composer cannot upload until a reconnect. */
  canUpload?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const connected = Boolean(channelTitle) && !paused;

  async function disconnect() {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/youtube/disconnect", { method: "POST" });
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
      ? "No channel was connected. You cancelled the authorization."
      : status === "nochannel"
        ? "That Google account has no YouTube channel. Connect an account that has one."
        : status === "notconfigured"
          ? "YouTube is not configured on the server yet."
          : status === "error"
            ? "Something went wrong connecting YouTube. Please try again."
            : null;
  // ?yt=limit is rendered once, by the page-level PlanNotice above the cards.

  return (
    <div className="st2-ig">
      <div className="st2-ig-row">
        {connected && avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="st2-ig-avatar" src={avatar} alt="" width={44} height={44} />
        ) : (
          <span className="st2-ig-logo yt" aria-hidden>
            {YT_LOGO}
          </span>
        )}
        <div className="st2-ig-meta">
          <b>YouTube</b>
          {connected ? (
            <small className="st2-ig-live">
              <i className="st2-live-dot" /> Connected. {channelTitle}
              {handle && <> · {handle}</>}
              {subscribers != null && <> · {subscribers.toLocaleString("en-US")} subscribers</>}
            </small>
          ) : paused ? (
            <small className="st2-ig-off">
              Paused by your plan{channelTitle ? <> ({channelTitle})</> : null}. Choose which accounts stay active in Plan &amp; billing.
            </small>
          ) : configured ? (
            <small className="st2-ig-off">
              Not connected. Link your channel to bring in your videos and analytics.
            </small>
          ) : (
            <small className="st2-ig-off">YouTube connection is coming soon.</small>
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
            <a className="st2-connect" href="/api/auth/youtube/start">
              Connect <ArrowRight size={13} />
            </a>
          ) : null}
        </div>
      </div>
      {connected && !canUpload && (
        <p className="st2-ig-note">
          Publishing to YouTube needs an extra permission. <a className="st2-connect" href="/api/auth/youtube/start?publish=1">Enable uploads</a>.
          Google may show an &quot;unverified app&quot; screen until this permission is reviewed; choose Advanced then continue to grant it.
        </p>
      )}
      {note && <p className="st2-ig-note">{note}</p>}
      {err && <p className="st2-ig-note">{err}</p>}
    </div>
  );
}
