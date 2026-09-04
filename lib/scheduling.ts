// Scheduling — the pure logic, kept free of I/O so it can be tested exactly.
//
// Two jobs: turn a saved Content Plan's weekday items into dated drafts, and
// decide the state of a scheduled post from facts (has media? has time? is it
// due?). Every status transition the publisher makes is defined here, so the
// UI, the API and the cron runner cannot drift apart on what "scheduled" means.

export type PostStatus = "draft" | "scheduled" | "publishing" | "published" | "failed" | "cancelled";
export type MediaType = "REELS" | "IMAGE";

export type ScheduledPost = {
  id: string;
  user_id: string;
  ig_user_id: string | null;
  plan_id: string | null;
  plan_day: string | null;
  scheduled_at: string;
  caption: string;
  media_type: MediaType;
  media_path: string | null;
  media_url: string | null;
  status: PostStatus;
  container_id: string | null;
  published_media_id: string | null;
  permalink: string | null;
  error: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
};

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Weekday index (Sun=0) for a plan's free-text day, or null when the plan
 *  used something that isn't a weekday ("Day 1", "Launch day"). */
export function weekdayIndex(day: string | null | undefined): number | null {
  const d = (day ?? "").trim().toLowerCase();
  const i = WEEKDAYS.findIndex((w) => d.startsWith(w.slice(0, 3)) && (d.length <= 3 || w.startsWith(d.slice(0, Math.min(d.length, w.length)))));
  return i >= 0 ? i : null;
}

/** The date of `weekday` in the week that starts on `weekStart` (a Monday, local
 *  midnight). Sunday lands at the END of that week, matching how a Mon-first
 *  plan reads. */
export function dateForWeekday(weekStart: Date, weekday: number): Date {
  // weekStart is Monday (getDay()=1). Offset Mon..Sun = 0..6.
  const offset = (weekday + 6) % 7;
  const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + offset);
  return d;
}

/** Caption a plan item becomes: the hook is the written first line; the
 *  concept follows. Nothing is generated here — this is the plan's own text. */
export function captionFromPlanItem(item: { hook?: string; concept?: string }): string {
  const hook = (item.hook ?? "").trim();
  const concept = (item.concept ?? "").trim();
  if (hook && concept && !concept.toLowerCase().startsWith(hook.toLowerCase())) return `${hook}\n\n${concept}`;
  return hook || concept;
}

/** Media type implied by a plan item's format label. Stories and carousels
 *  aren't publishable through this API path, so they fall back to a Reel
 *  with the format noted — the user can change it before attaching media. */
export function mediaTypeForFormat(format: string | null | undefined): MediaType {
  const f = (format ?? "").toLowerCase();
  if (f.includes("static") || f.includes("photo") || f.includes("image")) return "IMAGE";
  return "REELS";
}

export type PlanItem = { day: string; concept: string; hook: string; format: string };

export type DraftInput = {
  plan_day: string;
  scheduled_at: string; // ISO
  caption: string;
  media_type: MediaType;
};

/**
 * Drafts for one plan week. Items whose day isn't a weekday are skipped and
 * reported, never guessed onto a date. `hourFor(weekday)` lets the caller use
 * the audience's best hour per day; it defaults to noon.
 */
export function draftsFromPlan(
  items: PlanItem[],
  weekStart: Date,
  hourFor: (weekday: number) => number = () => 12,
): { drafts: DraftInput[]; skipped: string[] } {
  const drafts: DraftInput[] = [];
  const skipped: string[] = [];
  for (const it of items) {
    const wd = weekdayIndex(it.day);
    if (wd == null) { skipped.push(it.day); continue; }
    const d = dateForWeekday(weekStart, wd);
    const h = Math.max(0, Math.min(23, Math.round(hourFor(wd))));
    d.setHours(h, 0, 0, 0);
    drafts.push({
      plan_day: it.day,
      scheduled_at: d.toISOString(),
      caption: captionFromPlanItem(it),
      media_type: mediaTypeForFormat(it.format),
    });
  }
  return { drafts, skipped };
}

/** A post is ready to be scheduled only when it has media and a future time. */
export function readiness(p: Pick<ScheduledPost, "media_url" | "scheduled_at" | "caption">, now = new Date()): {
  ready: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  if (!p.media_url) missing.push("media");
  if (!p.caption.trim()) missing.push("caption");
  if (new Date(p.scheduled_at).getTime() <= now.getTime()) missing.push("a future time");
  return { ready: missing.length === 0, missing };
}

/** Due = scheduled, has media, and its time has passed. Grace window keeps a
 *  post from being skipped forever if the runner was late. */
export function isDue(p: Pick<ScheduledPost, "status" | "media_url" | "scheduled_at">, now = new Date(), graceHours = 12): boolean {
  if (p.status !== "scheduled" || !p.media_url) return false;
  const t = new Date(p.scheduled_at).getTime();
  return t <= now.getTime() && now.getTime() - t <= graceHours * 3600_000;
}

/** Instagram container status → what the publisher should do next. */
export type ContainerStatus = "IN_PROGRESS" | "FINISHED" | "ERROR" | "EXPIRED" | "PUBLISHED";

export function nextAction(status: ContainerStatus | null): "wait" | "publish" | "fail" | "done" {
  switch (status) {
    case "FINISHED": return "publish";
    case "PUBLISHED": return "done";
    case "ERROR":
    case "EXPIRED": return "fail";
    default: return "wait";
  }
}

export const MAX_ATTEMPTS = 3;

/** Instagram's 24-hour publishing cap is 100 API-published posts. SOCIA stays
 *  well inside it and reports the count rather than silently dropping posts. */
export const DAILY_PUBLISH_CAP = 25;
