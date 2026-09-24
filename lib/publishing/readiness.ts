// Publish readiness: one deterministic model for the command panel. The percent
// is transparent (required checks passed / required checks total), never an
// invented "quality score". Required problems (blocking) are separated from
// suggestions (warnings) so the UI can promise that suggestions do not block.
//
// Pure and client-safe: built from review() (lib/publishing/composer) and the
// content checks (lib/publishing/precheck). No platform calls, no guessing.

import { review, type ComposerDraft, type PickerAccount } from "./composer";
import type { Platform } from "./types";

export type ContentCheck = { id: string; label: string; value: string; tone: "good" | "note" | "warn" };

export type Fix = {
  id: string;
  destKey: string | null;
  platform: Platform | null;
  field?: string;
  message: string;
  severity: "required" | "suggested";
};

export type BucketId = "technical" | "content" | "platform" | "timing";
export type Bucket = { id: BucketId; label: string; done: number; total: number; ok: boolean };

export type PublishReadiness = {
  destinations: number;
  requiredTotal: number;
  requiredPassed: number;
  /** 0..100, from requiredPassed / requiredTotal only. */
  percent: number;
  buckets: Bucket[];
  required: Fix[];
  suggested: Fix[];
  canPublish: boolean;
};

/** A destination's time is set when scheduling now, or when no time issue blocks it. */
function timeSettled(mode: ComposerDraft["schedule"]["mode"], issues: { field?: string; code: string }[]): boolean {
  if (mode === "now") return true;
  return !issues.some((i) => i.field === "scheduledAt");
}

export function publishReadiness(
  draft: ComposerDraft,
  accounts: PickerAccount[],
  checks: ContentCheck[],
  opts: { now?: Date } = {},
): PublishReadiness {
  const rev = review(draft, accounts, opts.now);
  const rows = rev.rows;
  const destinations = rows.length;

  const notBlocked = rows.filter((r) => r.readiness.level !== "blocked").length;

  // Required checks: at least one destination, then each destination must not be
  // blocked. Time and content requirements already surface as per-destination
  // block issues, so they are counted here without double counting.
  const requiredTotal = 1 + destinations;
  const requiredPassed = (destinations > 0 ? 1 : 0) + notBlocked;
  const percent = requiredTotal > 0 ? Math.round((requiredPassed / requiredTotal) * 100) : 0;

  // Buckets are a view onto the same facts; they do not drive the percent.
  const contentGood = checks.filter((c) => c.tone !== "warn").length;
  const timeOk = rows.length > 0 && rows.every((r) => timeSettled(draft.schedule.mode, r.readiness.issues));
  const buckets: Bucket[] = [
    { id: "technical", label: "Technical", done: notBlocked, total: destinations, ok: destinations > 0 && notBlocked === destinations },
    { id: "content", label: "Content", done: contentGood, total: checks.length, ok: checks.every((c) => c.tone !== "warn") },
    { id: "platform", label: "Platform setup", done: destinations, total: destinations, ok: destinations > 0 },
    { id: "timing", label: "Timing", done: timeOk ? 1 : 0, total: 1, ok: timeOk },
  ];

  // Fixes. Required = blocking issues (deduped) plus "no destination". Suggested
  // = warnings plus content checks flagged warn. Suggestions never block.
  const required: Fix[] = [];
  const suggested: Fix[] = [];
  if (destinations === 0) {
    required.push({ id: "no-destination", destKey: null, platform: null, field: "destinations", message: "Select at least one destination.", severity: "required" });
  }
  const seen = new Set<string>();
  for (const r of rows) {
    for (const i of r.readiness.issues) {
      const key = `${r.platform}:${i.field ?? ""}:${i.code}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const fix: Fix = {
        id: `${r.key}:${i.code}`, destKey: r.key, platform: r.platform, field: i.field, message: i.message,
        severity: i.severity === "block" ? "required" : "suggested",
      };
      (fix.severity === "required" ? required : suggested).push(fix);
    }
  }
  for (const c of checks) {
    if (c.tone === "warn") suggested.push({ id: `content:${c.id}`, destKey: null, platform: null, message: `${c.label}: ${c.value}`, severity: "suggested" });
  }

  return {
    destinations, requiredTotal, requiredPassed, percent, buckets, required, suggested,
    canPublish: rev.canSubmit,
  };
}
