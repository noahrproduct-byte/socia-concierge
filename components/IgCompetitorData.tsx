"use client";

// Instagram competitor data via Business Discovery.
//
// This is the only route Meta offers to another account's numbers, and it is
// gated: it needs a Facebook Page linked to the user's Instagram Professional
// account. Until that exists the component explains the requirement instead of
// showing an empty table, and once it does the figures are real public data —
// followers, media count, and like/comment counts Meta actually returned.

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, RefreshCw, Info } from "lucide-react";
import type { IgCompetitor } from "@/app/api/competitors/instagram/route";

const IG_MARK = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
  </svg>
);

const fmtN = (n: number | null | undefined): string =>
  n == null ? "—"
  : n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M"
  : n >= 1e4 ? Math.round(n / 1e3) + "K"
  : n.toLocaleString("en-US");

export default function IgCompetitorData({ hasTracked }: { hasTracked: boolean }) {
  const [rows, setRows] = useState<IgCompetitor[] | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (refresh = false) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/competitors/instagram${refresh ? "?refresh=1" : ""}`);
      const j = await res.json();
      setEnabled(j.enabled !== false);
      setReason(j.reason ?? null);
      setRows(j.competitors ?? []);
    } catch {
      setEnabled(false);
      setReason("Instagram competitor data couldn't be loaded right now.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (enabled === null) return <div className="cp4-yt-skel" />;

  // Not connected: state the requirement, and offer the one action that fixes it.
  if (!enabled) {
    return (
      <div className="igc-enable">
        <span className="igc-enable-ico">{IG_MARK}</span>
        <div>
          <b>Enable Instagram competitor data</b>
          <p>
            {reason ??
              "Connect a Facebook Page linked to your Instagram Professional account to enable Instagram competitor data."}
          </p>
          <small>
            Instagram only shares another account&apos;s numbers through a Page-linked connection —
            SOCIA can&apos;t obtain them any other way, and won&apos;t estimate them.
          </small>
        </div>
        <a className="btn-primary igc-enable-cta" href="/api/auth/facebook/start">
          Connect Facebook Page
        </a>
      </div>
    );
  }

  if (!hasTracked) {
    return (
      <p className="cp4-empty">
        Track an Instagram competitor above and its real public numbers appear here.
      </p>
    );
  }

  return (
    <>
      <div className="cp4-tablewrap">
        <table className="cp4-table">
          <thead>
            <tr>
              <th>Account</th><th>Followers</th><th>Posts</th>
              <th>Posts / week</th><th>Median eng.</th><th>Eng. rate</th><th></th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) =>
              r.found ? (
                <tr key={r.handle}>
                  <td>
                    {r.profilePicture ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="cp4-face sm" src={r.profilePicture} alt="" width={26} height={26} />
                    ) : (
                      <span className="cp4-face ph sm">{r.handle[0]?.toUpperCase()}</span>
                    )}
                    <b>@{r.handle}</b>
                  </td>
                  <td className="cp4-real">{fmtN(r.followers)}</td>
                  <td className="cp4-real">{fmtN(r.mediaCount)}</td>
                  <td className="cp4-real">{r.postsPerWeek != null ? r.postsPerWeek.toFixed(1) : "—"}</td>
                  <td className="cp4-real">{fmtN(r.medianEngagement != null ? Math.round(r.medianEngagement) : null)}</td>
                  <td className="cp4-real">{r.engagementRate != null ? `${r.engagementRate.toFixed(1)}%` : "—"}</td>
                  <td>
                    <a href={`https://instagram.com/${r.handle}`} target="_blank" rel="noreferrer" className="cp4-open-hint">
                      View <ExternalLink size={11} />
                    </a>
                  </td>
                </tr>
              ) : (
                <tr key={r.handle}>
                  <td><span className="cp4-face ph sm">{r.handle[0]?.toUpperCase()}</span><b>@{r.handle}</b></td>
                  <td colSpan={6} className="cp4-na">{r.reason}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      <div className="igc-foot">
        <p className="cp4-note">
          <Info size={11} /> Real public data from Instagram Business Discovery. Meta serves this only
          for public Business and Creator accounts, and never exposes reach, saves or impressions for
          accounts you don&apos;t own — those stay unavailable rather than estimated.
        </p>
        <button type="button" className="cpd-refresh" onClick={() => load(true)} disabled={busy}>
          {busy ? <Loader2 size={13} className="cp4-spin" /> : <RefreshCw size={13} />} Refresh
        </button>
      </div>
    </>
  );
}
