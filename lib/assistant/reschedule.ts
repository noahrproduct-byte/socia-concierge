// Ask SOCIA's scheduling: the model says what the person asked for (which
// posts, and a rule such as "every 2 hours from 9 tomorrow" or "one a day at
// 6 PM for the rest of the week"); this works out the times. Times are never
// the model's arithmetic. Pure, zone-explicit, tested.
import type { TimedPost } from "@/lib/postingTimes";
import { zonedParts, zonedToUtc, formatClock } from "@/lib/publishing/timing";
import type { CalendarPost } from "@/lib/studioClips/batch";
import { scheduleBatch, tomorrowIn, LEAD_MIN } from "@/lib/studioClips/batch";

export type RescheduleRule = {
  /** "YYYY-MM-DDTHH:MM" in the viewer's zone, or null for "from tomorrow" */
  startLocal: string | null;
  /** > 0: one post every this many minutes from the start */
  spacingMinutes: number;
  /** > 0: this many a day (ignored when spacing is set) */
  perDay: number;
  /** "HH:MM" times of day the person named */
  times: string[];
  /** > 0: only this many days from the start */
  days: number;
};

export type RescheduleSlot = { id: string; at: string; reason: string };
export type ReschedulePlan = { slots: RescheduleSlot[]; unplaced: { id: string; reason: string }[]; summary: string };

export const MAX_SPACING_MIN = 7 * 24 * 60;
const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/;
const TIME_RE = /^(\d{1,2}):(\d{2})$/;

/** "HH:MM" → minutes after midnight, or null. */
export function minutesOf(t: string): number | null {
  const m = TIME_RE.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

function parseLocal(s: string | null): { date: string; minutes: number | null } | null {
  const m = s ? LOCAL_RE.exec(s.trim()) : null;
  if (!m) return null;
  return { date: `${m[1]}-${m[2]}-${m[3]}`, minutes: m[4] != null ? Number(m[4]) * 60 + Number(m[5]) : null };
}

const dayLabel = (iso: string, tz: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz }).format(new Date(iso));

export function planReschedule(input: {
  /** in the order the person wants them */
  posts: { id: string; title: string }[];
  rule: RescheduleRule;
  /** other scheduled posts, which keep their slots */
  existing: CalendarPost[];
  history: TimedPost[] | null;
  now: Date;
  tz: string;
}): ReschedulePlan {
  const { posts, rule, existing, history, now, tz } = input;
  if (!posts.length) return { slots: [], unplaced: [], summary: "There's nothing to schedule." };
  const start = parseLocal(rule.startLocal);
  const earliest = now.getTime() + LEAD_MIN * 60_000;

  // Every N minutes from the start, one after another.
  if (rule.spacingMinutes > 0) {
    const step = Math.min(MAX_SPACING_MIN, Math.max(5, Math.round(rule.spacingMinutes)));
    let t: number;
    if (start) {
      const [y, m, d] = start.date.split("-").map(Number);
      const mins = start.minutes ?? minutesOf(rule.times[0] ?? "") ?? 9 * 60;
      t = zonedToUtc(y, m, d, Math.floor(mins / 60), mins % 60, tz).getTime();
    } else {
      // The next whole hour that is at least half an hour away.
      const p = zonedParts(new Date(earliest), tz);
      t = zonedToUtc(p.year, p.month, p.day, p.hour, 0, tz).getTime() + 3600_000;
    }
    if (t < earliest) return { slots: [], unplaced: posts.map((p) => ({ id: p.id, reason: "That start time has passed. Pick a later one." })), summary: "That start time has passed." };
    const slots = posts.map((p, i) => ({ id: p.id, at: new Date(t + i * step * 60_000).toISOString(), reason: i === 0 ? "The start you asked for." : `${fmtStep(step)} after the one before.` }));
    return { slots, unplaced: [], summary: `${posts.length} post${posts.length === 1 ? "" : "s"}, ${fmtStep(step)} apart, from ${dayLabel(slots[0].at, tz)} at ${formatClock(slots[0].at, tz)}.` };
  }

  // A number a day, at the times named (or the default times), from the start day.
  const asked = rule.times.map(minutesOf).filter((m): m is number => m != null);
  if (!asked.length && start?.minutes != null && rule.perDay <= 1) asked.push(start.minutes);
  const startDate = start?.date ?? tomorrowIn(now, tz);
  const plan = scheduleBatch({
    items: posts.map((p) => ({ key: p.id, title: p.title, strength: "possible" as const, clipIds: [p.id], tags: [] })),
    perDay: Math.max(1, rule.perDay || 1), startDate, existing, history, now, tz,
    horizonDays: rule.days > 0 ? rule.days : undefined,
    minutesOfDay: asked.length ? asked : undefined,
  });
  const perDay = asked.length || Math.max(1, Math.min(3, rule.perDay || 1));
  const first = plan.slots[0];
  const summary = first
    ? `${plan.slots.length} post${plan.slots.length === 1 ? "" : "s"}, ${perDay} a day${asked.length ? ` at ${asked.map(clockOf).join(" and ")}` : ""}, from ${dayLabel(first.at, tz)}.${plan.unplaced.length ? ` ${plan.unplaced.length} didn't fit${rule.days > 0 ? ` in ${rule.days} day${rule.days === 1 ? "" : "s"}` : ""}.` : ""}`
    : "Nothing fits in that window.";
  return { slots: plan.slots.map((s) => ({ id: s.key, at: s.at, reason: s.reason })), unplaced: plan.unplaced.map((u) => ({ id: u.key, reason: rule.days > 0 ? `No room in the ${rule.days} day${rule.days === 1 ? "" : "s"} you asked for at ${perDay} a day.` : u.reason })), summary };
}

/** 540 → "9:00 AM". */
export function clockOf(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

function fmtStep(min: number): string {
  if (min % 1440 === 0) return `${min / 1440} day${min === 1440 ? "" : "s"}`;
  if (min % 60 === 0) return `${min / 60} hour${min === 60 ? "" : "s"}`;
  return `${min} minutes`;
}
