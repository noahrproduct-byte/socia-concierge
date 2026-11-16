// The goal step of onboarding (Noah, 2026-11-15): one or more goals, each with
// a target, and one timeframe, set against where the account really stands
// now. A target is filled in for the person to change: a plain rule (a fixed
// step above where they are now), said as a rule on the screen. SOCIA never
// says a target will be reached; it only checks that the target is a target
// (above the starting point) and the date is in the future. Pure and
// browser-safe.
import { formatGoalValue, goalMetric, type GoalMetricId } from "./growth";

/** The timeframes offered, in days; "custom" asks for a date. */
export const TIMEFRAMES = [30, 60, 90] as const;
export type Timeframe = (typeof TIMEFRAMES)[number] | "custom";

/** The date `days` from `today` (both YYYY-MM-DD, UTC). */
export function dueIn(days: number, today: string): string {
  return new Date(Date.parse(`${today}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** The due date a timeframe means, or null while a custom date hasn't been chosen. */
export function dueFor(frame: Timeframe | null, custom: string, today: string): string | null {
  if (frame == null) return null;
  if (frame === "custom") return /^\d{4}-\d{2}-\d{2}$/.test(custom) ? custom : null;
  return dueIn(frame, today);
}

/**
 * A typed number, or null. Thousands separators are fine, words after the
 * number are ignored ("50 paying users" is 50, "4.5%" is 4.5), and "10k" or
 * "1.2m" are read as thousands and millions.
 */
export const targetNumber = (text: string): number | null => {
  const m = /^[^\d-]*(-?\d[\d,\s]*(?:\.\d+)?)\s*([km])?(?![a-z])/i.exec(text.trim());
  if (!m) return null;
  const n = Number(m[1].replace(/[,\s]/g, "")) * (m[2] ? (m[2].toLowerCase() === "k" ? 1_000 : 1_000_000) : 1);
  return Number.isFinite(n) ? n : null;
};

/** How far above "now" the filled-in target sits, for each 30 days of the timeframe. */
export const SUGGEST_STEP = 0.1;

/** Whole days from `today` to `due` (both YYYY-MM-DD). */
export const daysUntil = (due: string, today: string): number =>
  Math.round((Date.parse(`${due}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);

/** A count rounded to a tidy number of its own size (13,300 not 13,300.1). */
function tidy(n: number): number {
  if (n < 100) return Math.ceil(n);
  if (n < 1_000) return Math.round(n / 5) * 5;
  if (n < 10_000) return Math.round(n / 50) * 50;
  const unit = 10 ** (Math.floor(Math.log10(n)) - 2);
  return Math.round(n / unit) * unit;
}

/**
 * The target filled in for a goal: SUGGEST_STEP above where the account is
 * now for each 30 days. A rule, not a forecast, and the person can change it.
 * Null when there is no starting number above zero to work from.
 */
export function suggestTarget(metric: GoalMetricId, now: number | null, days: number): number | null {
  if (now == null || !(now > 0) || !(days > 0)) return null;
  const raw = now * (1 + SUGGEST_STEP * (days / 30));
  if (goalMetric(metric)?.unit === "count") {
    const t = tidy(raw);
    return t > now ? t : Math.floor(now) + 1;
  }
  const t = Math.round(raw * 10) / 10;
  const up = t > now ? t : Math.round((now + 0.1) * 10) / 10;
  return goalMetric(metric)?.unit === "percent" ? Math.min(100, up) : up;
}

/** "10% above where you are now": the rule behind a filled-in target, in words. */
export function suggestRule(days: number): string {
  const pct = Math.round(SUGGEST_STEP * (days / 30) * 100);
  return `${pct}% above where you are now`;
}

/**
 * What is wrong with the goal as entered, or null when it can be saved. `now`
 * is where the account stands on this metric, when SOCIA can read it.
 */
export function goalStepError(input: { metric: GoalMetricId; target: string; frame: Timeframe | null; custom: string; today: string; now: number | null }): string | null {
  const m = goalMetric(input.metric);
  const t = targetNumber(input.target);
  if (t == null || t <= 0) return "Set a target above zero.";
  if (m?.unit === "percent" && t > 100) return "An engagement rate is a percentage, at most 100.";
  if (input.now != null && t <= input.now) return `Set a target above where you are now (${formatGoalValue(input.metric, input.now)}).`;
  if (input.frame == null) return "Choose when you want to reach it.";
  const due = dueFor(input.frame, input.custom, input.today);
  if (!due) return "Choose the date you want to reach it by.";
  if (due <= input.today) return "Choose a date after today.";
  return null;
}

/** "2,450 to 10,000 in 90 days": the goal as the person set it, for the screen. */
export function goalStepSummary(metric: GoalMetricId, now: number | null, target: number, due: string, today: string): string {
  const days = daysUntil(due, today);
  const from = now != null ? `${formatGoalValue(metric, now)} to ` : "";
  return `${from}${formatGoalValue(metric, target)} in ${days} days`;
}
