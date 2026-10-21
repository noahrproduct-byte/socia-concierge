"use client";

// Per-destination publishing status after submit, from the item the server
// last returned. One platform failing never changes another row. Errors quote
// the platform's own message; a missing measurement (no progress figure yet)
// is drawn as an indeterminate bar, never as 0%. An "uploading" row this tab
// is not driving (no progress entry: another tab, a reload, or a confirmation
// that never reached SOCIA) offers "Upload again", which the composer answers
// by re-sending a held confirmation or asking the server for a new session,
// never by uploading bytes a platform already holds.

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import type { RailProps } from "@/components/composer/contracts";
import { summarize } from "@/lib/publishing/status";
import { formatWhen } from "@/lib/publishing/timing";
import { trialLine, trialOf } from "@/lib/publishing/trial";
import { PLATFORM_LABEL, STATUS_LABEL, type Destination, type DestinationStatus } from "@/lib/publishing/types";
import type { ReadinessLevel } from "@/lib/publishing/validate";
import { PlatformMark, useNow, useViewerZone } from "./ReadinessPanel";
import DeleteOnPlatform, { useDeleteInfo, type DeleteInfo } from "@/components/DeleteOnPlatform";

type DeleteAnswer = { canDelete: boolean; targets: DeleteInfo[] };
const pickDelete = (j: unknown): DeleteAnswer | null => {
  const o = j as Partial<DeleteAnswer> | null;
  return o && Array.isArray(o.targets) ? { canDelete: Boolean(o.canDelete), targets: o.targets } : null;
};

const IN_FLIGHT: DestinationStatus[] = ["uploading", "processing"];
/** The platform's error is about the file itself, so offering a replacement is the honest next step. */
const FILE_ERROR = /\b(file|video|media|upload|format|codec|resolution|aspect|size|duration|bitrate|frame|unsupported)\b/i;

const pillClass: Record<DestinationStatus, ReadinessLevel | "neutral" | "info"> = {
  draft: "neutral", ready: "neutral", scheduled: "info", uploading: "info", processing: "info", published: "ready", failed: "blocked", cancelled: "neutral",
};

export default function PublishingStatus({ accounts, submission, onRetry, onEdit, onFocusField, onNew }: RailProps & { onNew?: () => void }) {
  const tz = useViewerZone();
  const now = useNow(15_000);
  const [retrying, setRetrying] = useState<string | null>(null);
  const item = submission.item;
  // Published destinations can be deleted from their platform; ask once per
  // newly published destination (the count is in the URL so a publish refetches).
  const publishedCount = (item?.destinations ?? []).filter((d) => d.status === "published" && d.externalPostId).length;
  const del = useDeleteInfo(item && publishedCount ? `/api/posts/${item.id}/platform-delete?n=${publishedCount}` : null, pickDelete);
  if (!item) return null;

  const dests: Destination[] = item.destinations ?? [];
  const summary = summarize(dests);
  const inFlight = dests.some((d) => IN_FLIGHT.includes(d.status)) || ["saving", "submitting", "uploading", "tracking"].includes(submission.phase);
  const busy = retrying != null || ["saving", "submitting", "uploading"].includes(submission.phase);

  const labelFor = (d: Destination) => accounts.find((a) => a.platform === d.platform && a.accountId === d.accountId)?.label ?? d.accountId;

  const retry = async (id: string) => {
    setRetrying(id);
    try { await onRetry(id); } finally { setRetrying(null); }
  };

  return (
    <section className="ov-card cr-card" aria-labelledby="cr-status-h" aria-live="polite">
      <div className="ov-card-head">
        <h2 id="cr-status-h">Publishing status</h2>
        <span className="cr-summary">{summary.line}</span>
      </div>

      {submission.error && <p className="cr-error cr-error-top" role="alert">{submission.error}</p>}

      {dests.length === 0 ? (
        <p className="cr-empty">This post has no destinations yet.</p>
      ) : (
        <ul className="cr-rows">
          {dests.map((d) => {
            const progress = submission.progress[d.id];
            const permalinkLabel = `View on ${PLATFORM_LABEL[d.platform]}`;
            const fileError = d.status === "failed" && d.errorMessage != null && FILE_ERROR.test(d.errorMessage);
            // An upload this tab is driving has a progress entry once the platform reports bytes; without one, nobody here is sending.
            const drivenHere = progress != null;
            return (
              <li key={d.id} className="cr-row">
                <div className="cr-row-head">
                  <span className="cr-plat">
                    <PlatformMark platform={d.platform} />
                    {PLATFORM_LABEL[d.platform]}
                    <small>{labelFor(d)}</small>
                  </span>
                  <span className={`cr-pill cr-${pillClass[d.status]}`}>
                    {d.status === "processing" && <Loader2 size={11} className="cr-spin" />}
                    {STATUS_LABEL[d.status]}
                  </span>
                </div>

                <div className="cr-status-body">
                  {trialOf(d.platform, d.settings) && d.status !== "cancelled" && (
                    <p className="cr-trial">{trialLine(trialOf(d.platform, d.settings)!, d.status === "published")}</p>
                  )}
                  {d.status === "uploading" && (
                    <>
                      <p>{drivenHere ? `Uploading · ${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` : submission.phase === "uploading" ? "Uploading; progress not reported yet." : "Upload not running in this tab."}</p>
                      <div
                        className={`cr-progress${drivenHere ? "" : " cr-unknown"}`}
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={drivenHere ? Math.round(progress * 100) : undefined}
                        aria-valuetext={drivenHere ? undefined : "Progress unknown"}
                      >
                        <i style={drivenHere ? { width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` } : undefined} />
                      </div>
                      {!drivenHere && submission.phase !== "uploading" && (
                        <div className="cr-status-actions">
                          <button type="button" className="btn-secondary" disabled={busy} onClick={() => void retry(d.id)}>
                            {retrying === d.id ? <Loader2 size={12} className="cr-spin" /> : <RefreshCw size={12} />} Upload again
                          </button>
                        </div>
                      )}
                    </>
                  )}
                  {d.status === "processing" && <p>{PLATFORM_LABEL[d.platform]} accepted the upload and is processing it.</p>}
                  {d.status === "scheduled" && (
                    <p>{d.scheduledAt ? (tz && now ? `Publishes ${formatWhen(d.scheduledAt, now, tz)}` : "Scheduled") : "Scheduled; time not recorded"}</p>
                  )}
                  {d.status === "published" && (
                    <>
                      {d.deletedAt || del.data?.targets.find((t) => t.destinationId === d.id)?.deletedAt ? null : d.permalink ? (
                        <a href={d.permalink} target="_blank" rel="noreferrer" className="cr-permalink">
                          {permalinkLabel} <ExternalLink size={12} />
                        </a>
                      ) : (
                        <p>Published{d.publishedAt && tz && now ? ` ${formatWhen(d.publishedAt, now, tz)}` : ""}. {PLATFORM_LABEL[d.platform]} did not return a link.</p>
                      )}
                      {d.errorMessage && <p className="cr-published-note">{d.errorMessage}</p>}
                      {(() => {
                        const info = del.data?.targets.find((t) => t.destinationId === d.id);
                        if (!info && d.deletedAt) return <DeleteOnPlatform info={{ destinationId: d.id, platform: d.platform, permalink: d.permalink, deletedAt: d.deletedAt, noun: "post", capability: null }} canDelete={false} request={{ url: "", method: "POST" }} />;
                        if (!info || !del.data) return null;
                        return (
                          <div className="cr-status-actions">
                            <DeleteOnPlatform info={info} canDelete={del.data.canDelete} request={{ url: `/api/posts/${item.id}/platform-delete`, method: "POST", body: { destinationId: d.id } }} onDeleted={del.reload} />
                          </div>
                        );
                      })()}
                    </>
                  )}
                  {d.status === "failed" && (
                    <>
                      <p className="cr-fail">{d.errorMessage ?? `${PLATFORM_LABEL[d.platform]} did not say why.`}</p>
                      <div className="cr-status-actions">
                        <button type="button" className="btn-secondary" disabled={busy} onClick={() => void retry(d.id)}>
                          {retrying === d.id ? <Loader2 size={12} className="cr-spin" /> : <RefreshCw size={12} />} Retry
                        </button>
                        <button type="button" className="btn-secondary" onClick={onEdit}>Fix settings</button>
                        {fileError && (
                          <button type="button" className="btn-secondary" onClick={() => { onEdit(); onFocusField(null, "media"); }}>
                            Replace video
                          </button>
                        )}
                      </div>
                    </>
                  )}
                  {(d.status === "draft" || d.status === "ready") && <p>Saved. Not scheduled yet.</p>}
                  {d.status === "cancelled" && <p>Withdrawn.</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!inFlight && summary.published > 0 && (
        <div className="cr-lifecycle" role="status">
          <div className="cr-life-track" aria-hidden>
            <span className="cr-life-step done">Published</span>
            <span className="cr-life-line" />
            <span className="cr-life-step pending">Learning</span>
          </div>
          <p>SOCIA measures this against your account median once its analytics arrive, then it feeds back into your Content Plan.</p>
        </div>
      )}

      {!inFlight && (
        <div className="cr-status-nav">
          <Link href="/calendar" className="btn-secondary">Back to calendar</Link>
          {onNew ? (
            <button type="button" className="btn-primary" onClick={onNew}>Create another</button>
          ) : (
            <Link href="/create" className="btn-primary">Create another</Link>
          )}
        </div>
      )}
    </section>
  );
}
