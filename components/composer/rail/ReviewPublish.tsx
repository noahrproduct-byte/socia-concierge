"use client";

// Review and the primary action. The button is only one gate: the server
// re-runs auth, plan and validateDestination before anything is scheduled or
// published. A plan restriction returned by the server renders as PlanNotice
// right here, next to the button it explains.

import { Loader2 } from "lucide-react";
import type { RailProps } from "@/components/composer/contracts";
import PlanNotice from "@/components/PlanNotice";
import { CAPABILITIES } from "@/lib/publishing/capabilities";
import { review } from "@/lib/publishing/composer";
import { formatWhen } from "@/lib/publishing/timing";
import { PLATFORM_LABEL } from "@/lib/publishing/types";
import { ACCOUNTS_UNKNOWN_SENTENCE } from "@/components/composer/useComposer";
import { LevelPill, PlatformMark, useNow, useViewerZone } from "./ReadinessPanel";

const BUSY_LABEL: Record<string, string> = {
  saving: "Saving…",
  submitting: "Sending…",
  uploading: "Uploading…",
  tracking: "Publishing…",
};

export default function ReviewPublish({ draft, accounts, submission, onSubmit, accountsComplete = true }: RailProps & { accountsComplete?: boolean }) {
  const tz = useViewerZone();
  const now = useNow(30_000);
  const rev = review(draft, accounts, now ?? undefined);
  const { mode } = draft.schedule;
  const busy = submission.phase !== "idle" && submission.phase !== "error" && submission.phase !== "done";
  // An incomplete account list blocks scheduling and publishing (the server refuses too); drafts still save.
  const canAct = accountsComplete && rev.canSubmit && rev.total > 0 && (submission.phase === "idle" || submission.phase === "error");
  const hasYouTube = rev.rows.some((r) => r.platform === "youtube");

  const platformsLabel = (() => {
    if (rev.total === 1) return PLATFORM_LABEL[rev.rows[0].platform];
    return `${rev.total} platforms`;
  })();
  const primaryLabel = mode === "now" ? `Publish to ${platformsLabel}` : `Schedule ${platformsLabel}`;
  const blocked = rev.rows.filter((r) => r.readiness.level === "blocked");

  const header = rev.total === 0
    ? "No destination selected"
    : rev.canSubmit
      ? "Ready to publish"
      : `${rev.readyCount} of ${rev.total} destinations ready`;

  return (
    <section className="ov-card cr-card" aria-labelledby="cr-review-h">
      <div className="ov-card-head">
        <h2 id="cr-review-h">Review</h2>
        <span className="cr-head-line">{header}</span>
      </div>

      {rev.rows.length > 0 && (
        <ul className="cr-rows">
          {rev.rows.map((r) => (
            <li key={r.key} className="cr-row">
              <div className="cr-row-head">
                <span className="cr-plat">
                  <PlatformMark platform={r.platform} />
                  {PLATFORM_LABEL[r.platform]}
                  <small>{r.label}</small>
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span className="cr-row-time">
                    {mode === "now" ? "Now" : r.at ? (tz && now ? formatWhen(r.at, now, tz) : "…") : "No time chosen"}
                  </span>
                  <LevelPill level={r.readiness.level} />
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="cr-actions">
        <button
          type="button"
          className="btn-primary"
          disabled={!canAct}
          onClick={() => void onSubmit(mode === "now" ? "publish" : "schedule")}
        >
          {busy ? (<><Loader2 size={14} className="cr-spin" /> {BUSY_LABEL[submission.phase] ?? "Working…"}</>) : primaryLabel}
        </button>
        {hasYouTube && <small className="cr-note" style={{ marginTop: 0 }}>{CAPABILITIES.youtube.notes[1]}</small>}
        {!accountsComplete && <p className="cr-blocked"><strong>Blocked:</strong> {ACCOUNTS_UNKNOWN_SENTENCE}</p>}
        {blocked.length > 0 && (
          <p className="cr-blocked">
            <strong>Blocked:</strong>{" "}
            {blocked.map((r, i) => {
              const first = r.readiness.issues.find((x) => x.severity === "block");
              return (
                <span key={r.key}>
                  {i > 0 && "; "}
                  {PLATFORM_LABEL[r.platform]}{first ? ` (${first.message.replace(/\.$/, "")})` : ""}
                </span>
              );
            })}
            .
          </p>
        )}
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => void onSubmit("draft")}>
          Save draft
        </button>
      </div>

      {submission.planError && <PlanNotice error={submission.planError} compact />}
      {!submission.planError && submission.phase === "error" && submission.error && (
        <p className="cr-error" role="alert">{submission.error}</p>
      )}
    </section>
  );
}
