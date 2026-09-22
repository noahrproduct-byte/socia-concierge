// The per-destination runner. Looks the adapter up, runs one publish or poll
// step inside a try/catch, persists the outcome, and recomputes the parent.
// One destination failing never touches another: every step is isolated and
// every error lands on exactly one row.
//
// The pure parts (backoff schedule, due predicate, sweep decisions, outcome
// -> row patch) are exported and unit-tested in runner.test.ts. Server only.

import { adapterFor, unavailable, type PublishAdapter, type PublishContext, type PublishOutcome } from "./adapter";
import { CAPABILITIES } from "./capabilities";
import type { ContentItem, Destination, DestinationStatus, Platform } from "./types";
import { listDue, loadItem, refreshParent, updateDestination, MissingTableError, type DueDestination } from "./db";
import { getEntitlements, checkFeature, type Entitlements } from "../entitlements";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

// The adapters module registers Instagram and YouTube with registerAdapter()
// as a side effect. It is loaded once, lazily, so the pure helpers above can
// be unit-tested without it and a load failure surfaces on the row it
// affected instead of taking the whole cron tick down.
let adaptersLoaded: Promise<void> | null = null;
function ensureAdapters(): Promise<void> {
  if (!adaptersLoaded) {
    adaptersLoaded = import("./adapters").then(() => undefined).catch((e) => {
      adaptersLoaded = null;
      throw e;
    });
  }
  return adaptersLoaded;
}

/** The registered adapter for a platform, after the registry has loaded. */
export async function loadAdapter(platform: Platform): Promise<PublishAdapter | null> {
  await ensureAdapters();
  return adapterFor(platform);
}

// ---------------------------------------------------------------------------
// Pure: retry schedule
// ---------------------------------------------------------------------------

/** Minutes to wait before retry 1, 2, 3. */
export const BACKOFF_MINUTES = [5, 15, 60] as const;
export const MAX_RETRIES = 3;
/** Same grace as the legacy sweep: past this a scheduled row is missed, not late. */
export const GRACE_HOURS = 12;
/** An upload that never reported an external id after this long is abandoned. */
export const UPLOAD_STALE_HOURS = 24;
/** Per-destination wall-clock budget inside a cron tick. */
export const STEP_BUDGET_MS = 40_000;

export const MISSED_MESSAGE = "Missed its window; reschedule to publish it.";
export const STALE_UPLOAD_MESSAGE = "The upload did not finish. Retry to upload again.";
export const NEEDS_BROWSER_MESSAGE = "YouTube uploads start from your browser. Open the post and use Retry to upload it.";

/** Wait (minutes) before the n-th retry, n starting at 1. */
export function backoffMinutes(retryNumber: number): number {
  const i = Math.max(0, Math.min(BACKOFF_MINUTES.length - 1, retryNumber - 1));
  return BACKOFF_MINUTES[i];
}

export type FailurePlan = { status: DestinationStatus; retryCount: number; nextRetryAt: string | null };

/**
 * What a failed attempt turns into. A retryable failure with retries left goes
 * back to scheduled with a next_retry_at; otherwise the row is failed.
 */
export function planFailure(dest: Pick<Destination, "retryCount">, retryable: boolean, now: Date): FailurePlan {
  const retryCount = dest.retryCount + 1;
  if (retryable && retryCount <= MAX_RETRIES) {
    return { status: "scheduled", retryCount, nextRetryAt: new Date(now.getTime() + backoffMinutes(retryCount) * 60_000).toISOString() };
  }
  return { status: "failed", retryCount, nextRetryAt: null };
}

// ---------------------------------------------------------------------------
// Pure: which rows are due, and what to do with each
// ---------------------------------------------------------------------------

const IN_FLIGHT: DestinationStatus[] = ["uploading", "processing"];

/**
 * Poll (not publish) when the platform already holds the job: anything in
 * flight, and any row with an external id whatever its status. A destination
 * that already exists on the platform is never uploaded or published twice.
 */
export function needsPoll(d: Pick<Destination, "status" | "externalPostId">): boolean {
  return IN_FLIGHT.includes(d.status) || Boolean(d.externalPostId);
}

/** The listDue predicate, for tests and for filtering rows defensively. */
export function isDueDestination(d: Pick<Destination, "status" | "scheduledAt" | "nextRetryAt">, now: Date): boolean {
  if (d.nextRetryAt && new Date(d.nextRetryAt).getTime() > now.getTime()) return false;
  if (IN_FLIGHT.includes(d.status)) return true;
  if (d.status !== "scheduled" || !d.scheduledAt) return false;
  return new Date(d.scheduledAt).getTime() <= now.getTime();
}

export type SweepDecision = "demote" | "missed" | "stale_upload" | "run";

/**
 * Sweep rules, in order. A scheduled row whose owner may not schedule any more
 * returns to draft (never deleted). A scheduled row older than the grace
 * window that was never attempted is missed; a row that failed and is waiting
 * for its retry follows the backoff instead, however old its original time.
 * An upload with no external id after 24 h is abandoned. A scheduled row that
 * already holds an external id (YouTube publishes it natively) is in flight
 * and is polled, whatever the plan or the clock says.
 */
export function sweepDecision(
  d: Pick<Destination, "status" | "scheduledAt" | "startedAt" | "updatedAt" | "externalPostId" | "retryCount" | "nextRetryAt">,
  now: Date,
  canSchedule: boolean,
): SweepDecision {
  const t = now.getTime();
  if (d.status === "scheduled" && !d.externalPostId) {
    if (!canSchedule) return "demote";
    const neverAttempted = d.retryCount === 0 && !d.nextRetryAt;
    if (neverAttempted && d.scheduledAt && t - new Date(d.scheduledAt).getTime() > GRACE_HOURS * 3600_000) return "missed";
  }
  if (d.status === "uploading" && !d.externalPostId) {
    const since = d.startedAt ?? d.updatedAt;
    if (since && t - new Date(since).getTime() > UPLOAD_STALE_HOURS * 3600_000) return "stale_upload";
  }
  return "run";
}

// ---------------------------------------------------------------------------
// Pure: outcome -> row patch
// ---------------------------------------------------------------------------

export function applyOutcome(dest: Destination, outcome: PublishOutcome, now: Date): Partial<Destination> {
  const iso = now.toISOString();
  const patch: Partial<Destination> = {
    status: outcome.status,
    startedAt: dest.startedAt ?? iso,
    externalPostId: outcome.externalPostId !== undefined ? outcome.externalPostId : dest.externalPostId,
    externalContainerId: outcome.externalContainerId !== undefined ? outcome.externalContainerId : dest.externalContainerId,
    permalink: outcome.permalink !== undefined ? outcome.permalink : dest.permalink,
  };
  if (outcome.status === "published") {
    patch.publishedAt = iso;
    patch.errorCode = null;
    // A published outcome may carry a note (the thumbnail or privacy caveat); it is kept, not an error.
    patch.errorMessage = outcome.errorMessage ?? null;
    patch.nextRetryAt = null;
    return patch;
  }
  if (outcome.status === "failed") {
    const plan = planFailure(dest, outcome.retryable !== false, now);
    patch.status = plan.status;
    patch.retryCount = plan.retryCount;
    patch.nextRetryAt = plan.nextRetryAt;
    patch.errorCode = outcome.errorCode ?? null;
    patch.errorMessage = outcome.errorMessage ?? "The platform did not say why.";
    return patch;
  }
  // In flight or handed back to scheduled (YouTube native schedule): progress clears old errors.
  patch.errorCode = outcome.errorCode ?? null;
  patch.errorMessage = outcome.errorMessage ?? null;
  patch.nextRetryAt = null;
  return patch;
}

// ---------------------------------------------------------------------------
// One step for one destination
// ---------------------------------------------------------------------------

/**
 * Run one publish or poll step for ctx.destination, persist the outcome and
 * refresh the parent. Never throws for platform reasons: an exception becomes
 * a retryable failure recorded on the row. Returns the outcome so routes can
 * hand a clientAction (browser upload) back.
 */
export async function publishDestination(ctx: PublishContext): Promise<PublishOutcome> {
  const { destination: dest, supabase, now } = ctx;
  let outcome: PublishOutcome;
  try {
    const adapter = await loadAdapter(dest.platform);
    if (!adapter) {
      outcome = unavailable(CAPABILITIES[dest.platform].notes[0]);
    } else {
      // A row the platform already holds is polled; adapter.publish never runs for it.
      outcome = needsPoll(dest) ? await adapter.poll(ctx) : await adapter.publish(ctx);
    }
  } catch (e) {
    const message = e instanceof Error && e.message ? e.message : "The platform could not be reached.";
    outcome = { status: "failed", errorCode: "exception", errorMessage: message, retryable: true };
  }
  outcome = withoutBrowser(outcome, ctx.interactive);
  await persistOutcome(supabase, dest, outcome, now);
  return outcome;
}

/**
 * Nobody is on the other end of a cron request to perform a clientAction, so
 * an outcome that needs the browser is recorded as failed (not retried by the
 * cron; a person can Retry it from the post) instead of as an upload that
 * never starts.
 */
export function withoutBrowser(outcome: PublishOutcome, interactive: boolean): PublishOutcome {
  if (interactive || !outcome.clientAction) return outcome;
  return { status: "failed", errorCode: "needs_browser", errorMessage: NEEDS_BROWSER_MESSAGE, retryable: false };
}

/**
 * The row patch persistOutcome writes. A publishing patch never overwrites an
 * existing external id or permalink with null (a concurrent confirm may have
 * written them first); the keys are left out instead.
 */
export function persistPatch(dest: Destination, outcome: PublishOutcome, now: Date): Partial<Destination> {
  const patch = applyOutcome(dest, outcome, now);
  if (patch.status === "published") {
    if (patch.externalPostId == null) delete patch.externalPostId;
    if (patch.permalink == null) delete patch.permalink;
  }
  return patch;
}

/**
 * Persist an outcome for a destination (also used by the complete route).
 * A row that meanwhile became published is left alone unless this outcome
 * publishes it too.
 */
export async function persistOutcome(supabase: Supa, dest: Destination, outcome: PublishOutcome, now: Date): Promise<void> {
  try {
    await updateDestination(supabase, dest.id, persistPatch(dest, outcome, now), { unlessPublished: true });
  } finally {
    await refreshParent(supabase, dest.postId).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// User mode: publish now, sequentially, and collect browser work
// ---------------------------------------------------------------------------

export type ClientUploadRequest = {
  destinationId: string;
  kind: "youtube_resumable_upload";
  sessionUri: string;
  accessToken: string;
  mediaId: string;
};

/**
 * Run one step for each destination given, oldest first, inside budgetMs.
 * Destinations the budget did not reach stay scheduled; the cron finishes
 * them. Returns the client uploads the adapters asked for.
 */
export async function publishNow(
  supabase: Supa,
  userId: string,
  item: ContentItem,
  destinations: Destination[],
  budgetMs: number,
): Promise<{ uploads: ClientUploadRequest[]; outcomes: Record<string, PublishOutcome> }> {
  const deadline = Date.now() + budgetMs;
  const uploads: ClientUploadRequest[] = [];
  const outcomes: Record<string, PublishOutcome> = {};
  for (const d of destinations) {
    const remaining = deadline - Date.now();
    if (remaining < 2_000) break;
    const now = new Date();
    const outcome = await publishDestination({ supabase, userId, item, destination: d, budgetMs: Math.min(STEP_BUDGET_MS, remaining), now, interactive: true });
    outcomes[d.id] = outcome;
    const a = outcome.clientAction;
    if (a && a.kind === "youtube_resumable_upload") {
      uploads.push({ destinationId: d.id, kind: a.kind, sessionUri: a.sessionUri, accessToken: a.accessToken, mediaId: a.mediaId });
    }
  }
  return { uploads, outcomes };
}

// ---------------------------------------------------------------------------
// The cron loop
// ---------------------------------------------------------------------------

export type RunResult = { id: string; postId: string; platform: string; result: string };
export type RunReport = { considered: number; results: RunResult[]; unavailable?: string };

function entitlementCache(supabase: Supa) {
  const cache = new Map<string, Promise<Entitlements>>();
  return (userId: string): Promise<Entitlements> => {
    let p = cache.get(userId);
    if (!p) { p = getEntitlements(supabase, userId); cache.set(userId, p); }
    return p;
  };
}

/** The plan sentence when this user may not schedule, or null when they may. */
export function schedulingBlock(ent: Entitlements): string | null {
  const c = checkFeature(ent, "scheduling");
  return c.ok ? null : c.error.error;
}

/**
 * Everyone's due destinations, oldest first, one at a time, within budgetMs.
 * Plan demotions and the two sweeps happen inline so the loop only ever
 * touches rows it examined.
 */
export async function runDueDestinations(svc: Supa, opts: { now: Date; budgetMs: number }): Promise<RunReport> {
  const { now } = opts;
  const deadline = Date.now() + opts.budgetMs;
  const results: RunResult[] = [];
  if (opts.budgetMs <= 0) return { considered: 0, results };

  let due: DueDestination[];
  try {
    due = (await listDue(svc, now, 50)).filter((d) => isDueDestination(d, now));
  } catch (e) {
    if (e instanceof MissingTableError) return { considered: 0, results, unavailable: "post_destinations is not migrated" };
    throw e;
  }

  const entFor = entitlementCache(svc);
  for (const d of due) {
    const remaining = deadline - Date.now();
    if (remaining < 3_000) break;
    const row: RunResult = { id: d.id, postId: d.postId, platform: d.platform, result: "" };
    results.push(row);
    try {
      const block = d.status === "scheduled" && !d.externalPostId ? schedulingBlock(await entFor(d.userId)) : null;
      const decision = sweepDecision(d, now, block == null);
      if (decision === "demote") {
        await updateDestination(svc, d.id, { status: "draft", errorMessage: block, errorCode: "plan", nextRetryAt: null });
        await refreshParent(svc, d.postId);
        row.result = "deferred: plan";
        continue;
      }
      if (decision === "missed") {
        await updateDestination(svc, d.id, { status: "failed", errorCode: "missed", errorMessage: MISSED_MESSAGE, nextRetryAt: null });
        await refreshParent(svc, d.postId);
        row.result = "missed";
        continue;
      }
      if (decision === "stale_upload") {
        await updateDestination(svc, d.id, { status: "failed", errorCode: "upload_stale", errorMessage: STALE_UPLOAD_MESSAGE, nextRetryAt: null });
        await refreshParent(svc, d.postId);
        row.result = "failed: upload stale";
        continue;
      }
      const item = await loadItem(svc, d.postId, null);
      if (!item) { row.result = "skipped: parent missing"; continue; }
      const outcome = await publishDestination({
        supabase: svc, userId: d.userId, item, destination: d,
        budgetMs: Math.min(STEP_BUDGET_MS, deadline - Date.now() - 1_000), now,
        interactive: false,
      });
      row.result = outcome.status === "failed" ? `failed: ${outcome.errorMessage ?? "no reason given"}` : outcome.status;
    } catch (e) {
      // A database error on one row must not stop the others.
      row.result = `error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  return { considered: due.length, results };
}
