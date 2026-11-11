// Putting the Sunday plan on the Calendar (Noah, 2026-11-05). When SOCIA
// writes the coming week's plan by itself (lib/weeklyPlanJob.ts) and that week
// has nothing on the Calendar, the plan's posts are placed on it as drafts, so
// the week is laid out without anyone opening the plan. Drafts only: a draft
// has no media and nothing publishes until a person adds the video and
// schedules it. A week that already holds a draft or a scheduled post is left
// exactly as it is.
//
// Times are placeholders: noon in the person's own time zone on the plan's day.
// The Calendar's own time suggestions apply when they schedule it.

import type { SupabaseClient } from "@supabase/supabase-js";
import { captionFromPlanItem, mediaTypeForFormat, weekdayIndex, type DraftInput } from "./scheduling";
import { isMissingColumnError } from "./workspaces";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export const PLACEHOLDER_HOUR = 12;

type Item = { day: string; concept: string; hook: string; format: string; maker?: "you" | "claude"; animated?: boolean; decision?: { status: string } };

/** The calendar date and weekday at `now` in `tz`. */
function localDate(now: Date, tz: string): { y: number; m: number; d: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric", weekday: "short" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { y: Number(get("year")), m: Number(get("month")) - 1, d: Number(get("day")), weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")) };
}

/** The instant a wall-clock time falls on in `tz` (the offset is read at that time, so a daylight-saving week is right). */
export function zonedInstant(y: number, m: number, d: number, hour: number, tz: string): Date {
  const guess = Date.UTC(y, m, d, hour);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess - (wall - guess));
}

/** The week the plan is for: its Monday at 00:00 in `tz` (today when it is Monday, otherwise the next one) and the Monday after. */
export function comingWeek(now: Date, tz: string): { start: Date; end: Date; monday: { y: number; m: number; d: number } } {
  const c = localDate(now, tz);
  const ahead = c.weekday === 1 ? 0 : (8 - c.weekday) % 7;
  const mon = new Date(Date.UTC(c.y, c.m, c.d + ahead));
  const monday = { y: mon.getUTCFullYear(), m: mon.getUTCMonth(), d: mon.getUTCDate() };
  return { start: zonedInstant(monday.y, monday.m, monday.d, 0, tz), end: zonedInstant(monday.y, monday.m, monday.d + 7, 0, tz), monday };
}

/**
 * The plan's posts as drafts for that week, at noon local on each post's day.
 * Left out: a post whose day isn't a weekday, one that is already past, one
 * the person turned down, one their own Claude makes (that flow places
 * its own video), and an animated post (placed with its video when made).
 */
export function comingWeekDrafts(items: Item[], now: Date, tz: string): DraftInput[] {
  const { monday } = comingWeek(now, tz);
  const out: DraftInput[] = [];
  for (const it of items) {
    // Animated posts go on the Calendar with their video, from "Generate animated videos".
    if (it.maker === "claude" || it.animated || it.decision?.status === "rejected") continue;
    const wd = weekdayIndex(it.day);
    if (wd == null) continue;
    const at = zonedInstant(monday.y, monday.m, monday.d + ((wd + 6) % 7), PLACEHOLDER_HOUR, tz);
    if (at.getTime() <= now.getTime()) continue;
    const caption = captionFromPlanItem(it);
    if (!caption) continue;
    out.push({ plan_day: it.day, scheduled_at: at.toISOString(), caption: caption.slice(0, 2200), media_type: mediaTypeForFormat(it.format) });
  }
  return out;
}

/**
 * Place the plan on its week when the week is empty. Returns how many drafts
 * were added: 0 when the week already holds something, the plan has no
 * placeable post, or the Calendar can't be read (then nothing is written).
 */
export async function placePlanOnEmptyWeek(svc: Supa, a: { ownerId: string; workspaceId: string | null; planId: string; items: Item[]; igUserId: string | null; now: Date; tz: string }): Promise<number> {
  const drafts = comingWeekDrafts(a.items, a.now, a.tz);
  if (!drafts.length) return 0;
  const { start, end } = comingWeek(a.now, a.tz);
  try {
    // Only this owner's posts, and only this brand's when the Calendar is per workspace.
    let q = svc.from("scheduled_posts").select("id").eq("user_id", a.ownerId).in("status", ["draft", "scheduled", "publishing"])
      .gte("scheduled_at", start.toISOString()).lt("scheduled_at", end.toISOString()).limit(1);
    if (a.workspaceId) q = q.eq("workspace_id", a.workspaceId);
    let { data, error } = await q;
    if (error && a.workspaceId && isMissingColumnError(error)) {
      ({ data, error } = await svc.from("scheduled_posts").select("id").eq("user_id", a.ownerId).in("status", ["draft", "scheduled", "publishing"])
        .gte("scheduled_at", start.toISOString()).lt("scheduled_at", end.toISOString()).limit(1));
    }
    if (error || (data ?? []).length) return 0;

    const rows = drafts.map((d) => ({
      user_id: a.ownerId, ig_user_id: a.igUserId, plan_id: a.planId, plan_day: d.plan_day, scheduled_at: d.scheduled_at,
      caption: d.caption, media_type: d.media_type, media_path: null, media_url: null, status: "draft",
    }));
    let ins = a.workspaceId
      ? await svc.from("scheduled_posts").insert(rows.map((r) => ({ ...r, workspace_id: a.workspaceId }))).select("id")
      : await svc.from("scheduled_posts").insert(rows).select("id");
    if (ins.error && a.workspaceId && isMissingColumnError(ins.error)) ins = await svc.from("scheduled_posts").insert(rows).select("id");
    return ins.error ? 0 : (ins.data ?? []).length;
  } catch {
    return 0;
  }
}
