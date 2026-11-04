// When a video the person's Claude made for the weekly plan goes out: the
// plan's own weekday, in the week the plan is for, at the account's best
// posting time that day (or 6 PM when there isn't enough history), in the
// owner's time zone. Pure.

import { weekdayIndex } from "../scheduling";
import { zonedParts, zonedToUtc, MINUTES_INTO_BLOCK } from "../publishing/timing";
import { BLOCK_STARTS } from "../postingTimes";

const DAY_MS = 86_400_000;
/** Without enough posting history: early evening, when most audiences are online. */
export const DEFAULT_HOUR = 18;

export type Ymd = { year: number; month: number; day: number };

/**
 * The Monday of the week a plan is for, in `tz`: the plan's own week, or the
 * next one when it was made on a Thursday or later, or on a Sunday (the rule
 * the Content Plan uses when it puts a plan on the Calendar; the Sunday plan
 * is for the week that starts the next day).
 */
export function planWeekMonday(createdAt: Date, tz: string): Ymd {
  const p = zonedParts(createdAt, tz);
  const back = p.weekday === 0 ? 6 : p.weekday - 1;
  const next = p.weekday === 0 || p.weekday >= 4 ? 7 : 0;
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day) + (next - back) * DAY_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Best posting window per weekday (0 = Monday), from lib/publishing/timing recommendedWindows. */
export type DayWindow = { day: number; block: number; rel: number };

/** The hour and minute to post on a weekday (0 = Monday): its best window, or the default. */
export function slotFor(day: number, windows: DayWindow[]): { hour: number; minute: number } {
  const best = windows.filter((w) => w.day === day).sort((a, b) => b.rel - a.rel)[0];
  return best ? { hour: BLOCK_STARTS[best.block], minute: MINUTES_INTO_BLOCK } : { hour: DEFAULT_HOUR, minute: 0 };
}

/** The planned time of a plan post (ISO), or null when its day isn't a weekday. */
export function plannedTime(createdAt: Date, planDay: string, tz: string, windows: DayWindow[] = []): string | null {
  const wd = weekdayIndex(planDay);
  if (wd == null) return null;
  const offset = (wd + 6) % 7;
  const mon = planWeekMonday(createdAt, tz);
  const d = new Date(Date.UTC(mon.year, mon.month - 1, mon.day) + offset * DAY_MS);
  const { hour, minute } = slotFor(offset, windows);
  return zonedToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), hour, minute, tz).toISOString();
}

/** Scheduling a reviewed video: its planned time while that is still ahead, otherwise 15 minutes from now (on the quarter hour). */
export function approvalTime(planned: string | null, now: Date): string {
  const lead = 15 * 60_000;
  const t = planned ? Date.parse(planned) : NaN;
  if (Number.isFinite(t) && t > now.getTime() + lead) return new Date(t).toISOString();
  const q = 15 * 60_000;
  return new Date(Math.ceil((now.getTime() + lead) / q) * q).toISOString();
}
