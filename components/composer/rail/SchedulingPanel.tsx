"use client";

// When each destination publishes. Three modes: now, a chosen time, or the
// recommended window. The recommended window comes from the account's own
// Instagram history only, so it is offered only while an Instagram destination
// is enabled and that history clears MIN_POSTS with a window that stands out;
// when Instagram is switched off the draft falls back to a chosen time rather
// than pretend. Times are edited and shown in the viewer's zone; the draft
// stores ISO instants. A past time shows the validator's own issue inline; the
// server re-validates regardless.

import { useEffect, useMemo } from "react";
import type { RailProps } from "@/components/composer/contracts";
import { CAPABILITIES } from "@/lib/publishing/capabilities";
import { enabledDestinations, readinessFor, type ScheduleMode } from "@/lib/publishing/composer";
import { fromLocalInput, historySentence, recommendedWindows, toLocalInput, formatWhen, YOUTUBE_NO_HISTORY_SENTENCE } from "@/lib/publishing/timing";
import { PLATFORM_LABEL } from "@/lib/publishing/types";
import type { Issue } from "@/lib/publishing/validate";
import { PlatformMark, useNow, useViewerZone } from "./ReadinessPanel";

const TIME_CODES = new Set(["time_missing", "time_invalid", "time_past"]);
const timeIssues = (issues: Issue[]) => issues.filter((i) => TIME_CODES.has(i.code));

export default function SchedulingPanel({ draft, accounts, dispatch, timing }: RailProps) {
  const tz = useViewerZone();
  const now = useNow(30_000);
  const enabled = enabledDestinations(draft);
  const { mode, at, sameForAll } = draft.schedule;
  const hasInstagram = enabled.some((d) => d.platform === "instagram");
  const hasYouTube = enabled.some((d) => d.platform === "youtube");

  const timed = timing.instagram?.timed ?? null;
  const rec = useMemo(
    () => (timed && now ? recommendedWindows(timed, now, tz ?? "UTC") : null),
    [timed, now, tz],
  );
  const historyClears = Boolean(rec?.enough && rec.best[0]);
  // The window is Instagram evidence: without an Instagram destination it recommends nothing.
  const canRecommend = hasInstagram && historyClears;

  // A stored draft may say "recommended" while Instagram is off or this account
  // no longer has the history for it; fall back to a chosen time rather than pretend.
  // `now` is null before mount, when nothing has been read yet.
  useEffect(() => {
    if (mode === "recommended" && now && !canRecommend) dispatch({ type: "set_schedule", schedule: { mode: "later" } });
  }, [mode, now, canRecommend, dispatch]);

  const setMode = (m: ScheduleMode) => {
    if (m === "recommended") {
      if (!canRecommend) return;
      dispatch({ type: "set_schedule", schedule: { mode: "recommended", at: rec!.best[0].nextAt } });
      return;
    }
    dispatch({ type: "set_schedule", schedule: { mode: m } });
  };

  const readiness = useMemo(
    () => enabled.map((d) => ({ d, issues: timeIssues(readinessFor(draft, d, accounts, now ?? undefined).issues) })),
    [enabled, draft, accounts, now],
  );
  const sharedIssues = readiness.flatMap((r) => r.issues).filter((i, idx, arr) => arr.findIndex((x) => x.code === i.code) === idx);
  const zoneName = tz ? tz.replace(/_/g, " ") : null;

  const labelFor = (platform: string, accountId: string) => accounts.find((a) => a.platform === platform && a.accountId === accountId)?.label ?? accountId;

  const recommendedHint = !hasInstagram
    ? historyClears
      ? "Add an Instagram destination to use its history; SOCIA has no posting history for the other platforms."
      : "Comes from an enabled Instagram account's own posting history."
    : historySentence(rec, timed != null);

  return (
    <section className="ov-card cr-card" aria-labelledby="cr-sched-h">
      <div className="ov-card-head">
        <h2 id="cr-sched-h">Scheduling</h2>
      </div>

      <div className="cr-radios" role="radiogroup" aria-label="When to publish">
        <label className={`cr-radio${mode === "now" ? " on" : ""}`}>
          <input type="radio" name="cr-mode" checked={mode === "now"} onChange={() => setMode("now")} />
          <span className="cr-radio-body">
            <strong>Publish now</strong>
            <small>Every enabled platform starts as soon as you confirm.</small>
          </span>
        </label>
        <label className={`cr-radio${mode === "later" ? " on" : ""}`}>
          <input type="radio" name="cr-mode" checked={mode === "later"} onChange={() => setMode("later")} />
          <span className="cr-radio-body">
            <strong>Schedule for later</strong>
            <small>Pick a date and time{zoneName ? ` in ${zoneName}` : ""}.</small>
          </span>
        </label>
        <label className={`cr-radio${mode === "recommended" ? " on" : ""}${canRecommend ? "" : " off"}`} aria-disabled={!canRecommend}>
          <input type="radio" name="cr-mode" checked={mode === "recommended"} disabled={!canRecommend} onChange={() => setMode("recommended")} />
          <span className="cr-radio-body">
            <strong>Recommended time</strong>
            <small>{recommendedHint}</small>
          </span>
        </label>
      </div>

      {mode === "recommended" && hasYouTube && <small className="cr-note">{YOUTUBE_NO_HISTORY_SENTENCE}</small>}

      {mode !== "now" && (
        <>
          {(sameForAll || enabled.length === 0) && (
            <label className="cr-field">
              <span>
                Date and time
                <em>{zoneName ?? ""}</em>
              </span>
              <input
                type="datetime-local"
                className={`cr-input${sharedIssues.length ? " cr-bad" : ""}`}
                value={tz ? toLocalInput(at, tz) : ""}
                disabled={!tz}
                onChange={(e) => {
                  if (!tz) return;
                  dispatch({ type: "set_schedule", schedule: { mode: "later", at: fromLocalInput(e.target.value, tz) } });
                }}
              />
              {mode === "recommended" && at && tz && now && (
                <small className="cr-note" style={{ marginTop: 0 }}>Next window: {formatWhen(at, now, tz)}{rec ? ` · based on ${rec.posts} Instagram posts` : ""}</small>
              )}
              {sameForAll && sharedIssues.map((i) => <p key={i.code} className="cr-inline-issue">{i.message}</p>)}
            </label>
          )}

          {enabled.length > 1 && (
            <label className="cr-toggle">
              <span>Use the same time for all platforms</span>
              <input
                type="checkbox"
                checked={sameForAll}
                onChange={(e) => dispatch({ type: "set_schedule", schedule: { sameForAll: e.target.checked } })}
              />
            </label>
          )}

          {!sameForAll && enabled.length > 0 && (
            <div className="cr-dest-times">
              {readiness.map(({ d, issues }) => (
                <label key={d.key} className="cr-field">
                  <span>
                    <span className="cr-plat" style={{ fontSize: 12, textTransform: "none", letterSpacing: 0 }}>
                      <PlatformMark platform={d.platform} size={12} />
                      {PLATFORM_LABEL[d.platform]}
                      <small>{labelFor(d.platform, d.accountId)}</small>
                    </span>
                    <em>{zoneName ?? ""}</em>
                  </span>
                  <input
                    type="datetime-local"
                    className={`cr-input${issues.length ? " cr-bad" : ""}`}
                    value={tz ? toLocalInput(d.scheduledAt ?? at, tz) : ""}
                    disabled={!tz}
                    onChange={(e) => {
                      if (!tz) return;
                      dispatch({ type: "set_destination_time", key: d.key, at: fromLocalInput(e.target.value, tz) });
                    }}
                  />
                  {issues.map((i) => <p key={i.code} className="cr-inline-issue">{i.message}</p>)}
                  {d.platform === "youtube" && <small className="cr-note" style={{ marginTop: 0 }}>{CAPABILITIES.youtube.notes[0]}</small>}
                </label>
              ))}
            </div>
          )}

          {sameForAll && hasYouTube && <small className="cr-note">{CAPABILITIES.youtube.notes[0]}</small>}
        </>
      )}
    </section>
  );
}
