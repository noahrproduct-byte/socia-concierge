// The posting streak against the person's own weekly target (Noah's SIO
// brief, 2026-11-16). A week qualifies when the brand has posted on at least
// N different days, N being the posting target in force when that week began.
// The streak is the run of qualifying weeks in a row.
//
// The rules, in one place:
// - A posting day is a local calendar day (the person's time zone) with at
//   least one published post SOCIA can see on the brand's connected accounts.
//   Five posts on one day are one posting day. A scheduled post counts only
//   once it is published.
// - Weeks run Monday to Sunday in that time zone.
// - A change of target starts with the next week: the week in progress, and
//   every week before it, keeps the target it began with.
// - A finished week is written down once (the ledger). A post deleted later,
//   or one that drops out of what the platform returns, doesn't change it.
// - A planned break week neither counts nor breaks the streak.
// - A day SOCIA failed to publish a scheduled post, through no fault of the
//   person's, counts as a posting day.
// - Before a target was ever set, the target is one posting day a week.
//
// Pure and browser-safe. The reading and writing are in lib/postingStreakLoad.ts.

const DAY = 86_400_000;

/** Posting days a week before the person chose a target. */
export const DEFAULT_TARGET = 1;
/** Weeks the strip shows, and how far back a streak is read. */
export const STREAK_STRIP = 8;
export const STREAK_LOOKBACK_WEEKS = 26;
/** Hours after a week ends before it is written down, so a late platform read still counts. */
export const FINALIZE_AFTER_HOURS = 36;
/** Planned break weeks allowed in any BREAK_WINDOW_WEEKS. */
export const MAX_BREAKS = 2;
export const BREAK_WINDOW_WEEKS = 12;

/** Publishing failures that are SOCIA's or the platform's, not the person's (post_destinations.error_code). */
export const PROTECTED_FAILURES = ["unavailable", "exception", "container_error", "container_expired", "quota_exhausted", "missed", "upload_stale"];

export type TargetChange = { days: number; effective_from: string };
export type LedgerWeek = { week_start: string; target: number; days: number; qualified: boolean; is_break: boolean; finalized: boolean };

/** A valid IANA zone, or UTC. */
export function safeZone(tz: string | null | undefined): string {
  if (!tz) return "UTC";
  try { new Intl.DateTimeFormat("en-CA", { timeZone: tz }); return tz; } catch { return "UTC"; }
}

/** The calendar day (YYYY-MM-DD) an instant falls on in a time zone. Null for a time that can't be read. */
export function localDay(iso: string | Date | null | undefined, tz: string): string | null {
  const d = iso instanceof Date ? iso : iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: safeZone(tz), year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const asUtc = (day: string) => Date.parse(`${day}T00:00:00Z`);
/** A calendar day moved by `n` days. */
export const addDays = (day: string, n: number): string => new Date(asUtc(day) + n * DAY).toISOString().slice(0, 10);
/** The Monday that starts the week a calendar day is in. */
export function weekStartOf(day: string): string {
  const dow = (new Date(asUtc(day)).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(day, -dow);
}

/** The distinct posting days in each week, from the times posts were published. */
export function postingDaysByWeek(times: (string | null | undefined)[], tz: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const t of times) {
    const day = localDay(t, tz);
    if (!day) continue;
    const w = weekStartOf(day);
    if (!out.has(w)) out.set(w, new Set());
    out.get(w)!.add(day);
  }
  return out;
}

/** The target in force when a week began: the latest change effective on or before that Monday. */
export function targetForWeek(weekStart: string, history: TargetChange[]): number {
  let best: TargetChange | null = null;
  for (const h of history) if (h.effective_from <= weekStart && (!best || h.effective_from >= best.effective_from)) best = h;
  return best ? best.days : DEFAULT_TARGET;
}

/** When a target chosen today starts: the Monday of next week. Never the week in progress. */
export const nextTargetStart = (today: string): string => addDays(weekStartOf(today), 7);

/** The target a brand's history should hold next, or null when it already matches what the person chose. */
export function targetChangeNeeded(chosen: number | null | undefined, history: TargetChange[], today: string): TargetChange | null {
  if (!chosen || chosen < 1 || chosen > 7) return null;
  const latest = [...history].sort((a, b) => a.effective_from.localeCompare(b.effective_from)).pop();
  if (latest && latest.days === chosen) return null;
  // Nothing recorded and the choice is the default: there is nothing to change.
  if (!latest && chosen === DEFAULT_TARGET) return null;
  return { days: chosen, effective_from: nextTargetStart(today) };
}

/**
 * Whether the moment has come to write a week down for good: the week is over
 * in the person's time zone, and FINALIZE_AFTER_HOURS have passed since the
 * UTC midnight that follows its Sunday (between one and two days after the
 * week really ended, wherever the person is).
 */
export function canFinalize(weekStart: string, now: Date, tz: string): boolean {
  const end = addDays(weekStart, 7);
  return (localDay(now, tz) ?? "") >= end && now.getTime() >= asUtc(end) + FINALIZE_AFTER_HOURS * 3_600_000;
}

export type WeekView = { week_start: string; target: number; days: number; qualified: boolean; is_break: boolean; current: boolean };

/**
 * Every week from the oldest needed to this one, each from the ledger when it
 * was written down, else counted now from the posts SOCIA can see.
 */
export function weeksView(input: {
  today: string;
  ledger: LedgerWeek[];
  history: TargetChange[];
  /** Posting days per week counted now (posts seen plus protected failure days). */
  live: Map<string, Set<string>>;
  weeks?: number;
}): WeekView[] {
  const cur = weekStartOf(input.today);
  const n = input.weeks ?? STREAK_LOOKBACK_WEEKS;
  const byStart = new Map(input.ledger.map((w) => [w.week_start, w]));
  const out: WeekView[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const ws = addDays(cur, -7 * i);
    const led = byStart.get(ws);
    if (led?.finalized) { out.push({ week_start: ws, target: led.target, days: led.days, qualified: led.qualified, is_break: led.is_break, current: ws === cur }); continue; }
    const target = targetForWeek(ws, input.history);
    const days = input.live.get(ws)?.size ?? 0;
    out.push({ week_start: ws, target, days, qualified: days >= target, is_break: Boolean(led?.is_break), current: ws === cur });
  }
  return out;
}

export type PostingStreak = {
  /** Qualifying weeks in a row, up to now. */
  weeks: number;
  longest: number;
  /** The last STREAK_STRIP weeks, oldest first. */
  strip: { week_start: string; state: "hit" | "miss" | "break" | "open" }[];
  thisWeek: { days: number; target: number; qualified: boolean; is_break: boolean };
};

/**
 * The streak from the weeks. This week counts as soon as it qualifies, and
 * doesn't break the streak while it is still open. A break week is stepped
 * over: it adds nothing and ends nothing.
 */
export function streakOf(weeks: WeekView[]): PostingStreak {
  const cur = weeks[weeks.length - 1];
  let run = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    const w = weeks[i];
    if (w.is_break) continue;
    if (w.qualified) { run++; continue; }
    if (w.current) continue; // still open: it can't have been missed yet
    break;
  }
  let longest = 0, streak = 0;
  for (const w of weeks) {
    if (w.is_break) continue;
    if (w.qualified) { streak++; longest = Math.max(longest, streak); }
    else if (!w.current) streak = 0;
  }
  const strip = weeks.slice(-STREAK_STRIP).map((w) => ({
    week_start: w.week_start,
    state: w.is_break ? ("break" as const) : w.qualified ? ("hit" as const) : w.current ? ("open" as const) : ("miss" as const),
  }));
  return { weeks: run, longest: Math.max(longest, run), strip, thisWeek: { days: cur?.days ?? 0, target: cur?.target ?? DEFAULT_TARGET, qualified: Boolean(cur?.qualified), is_break: Boolean(cur?.is_break) } };
}

/** Whether another break week may be planned: at most MAX_BREAKS in the window, counting ones already planned. */
export function canPlanBreak(weekStart: string, ledger: LedgerWeek[]): boolean {
  const from = addDays(weekStart, -7 * (BREAK_WINDOW_WEEKS - 1));
  const used = ledger.filter((w) => w.is_break && w.week_start >= from && w.week_start !== weekStart).length;
  return used < MAX_BREAKS;
}

/** What SIO says about this week. Helpful, never a telling-off. */
export function weekLine(t: PostingStreak["thisWeek"]): string {
  const days = (n: number) => `${n} posting ${n === 1 ? "day" : "days"}`;
  if (t.is_break) return "This is a planned break week. It doesn't count for or against your streak.";
  if (t.qualified) return t.days > t.target ? `You've posted on ${t.days} days this week, past your target of ${t.target}.` : `You've hit your ${days(t.target)} this week.`;
  const left = t.target - t.days;
  if (t.days === 0) return `Your target this week is ${days(t.target)}.`;
  if (left === 1) return "One more posting day and you'll complete your weekly goal.";
  return `You're at ${t.days} of your ${days(t.target)} this week.`;
}

export type WeekDayCell = { date: string; state: "posted" | "today" | "past" | "later" };

/**
 * The seven days of a week for the streak card: a day with a post, today
 * without one yet, an earlier day without one, or a day still to come. Pure.
 */
export function weekDayCells(start: string, today: string, posted: string[]): WeekDayCell[] {
  const on = new Set(posted);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    return { date, state: on.has(date) ? "posted" : date === today ? "today" : date < today ? "past" : "later" };
  });
}

