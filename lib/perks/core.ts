// Two small things that reward using SOCIA (Noah, 2026-11-15): finishing the
// first week's four real steps, and posting through SOCIA four weeks in a row.
// Both give the same modest perk: a few extra AI credits, and room in the
// month's AI ceiling to use them. Everything shown is counted from
// what the account has really done; nothing here is a score or a prediction.
// Pure and browser-safe.

/**
 * The perk: extra AI credits, added once to the account's balance. Like a
 * top-up they don't expire at the end of the month. About 100 credits is what
 * PERK_CAP_USD of AI costs SOCIA at the credit margin (lib/credits/config.ts).
 */
export const PERK_CREDITS = 100;
/** How long the month's AI ceiling has the extra room, so the credits can be used. */
export const PERK_DAYS = 30;
/** Room added to the month's AI ceiling while the perk is on. */
export const PERK_CAP_USD = 0.75;

const DAY = 86_400_000;

export const perkLive = (until: string | null | undefined, now: Date = new Date()): boolean => Boolean(until) && new Date(until as string).getTime() > now.getTime();

/** The perk in words: "100 extra AI credits". */
export const PERK_WORDS = `${PERK_CREDITS} extra AI credits`;

/** When the ceiling's extra room runs until, for a perk given now: 30 days from now, or its current end if that is later. */
export function perkUntil(current: string | null | undefined, now: Date = new Date()): string {
  const next = now.getTime() + PERK_DAYS * DAY;
  return new Date(Math.max(next, current ? new Date(current).getTime() : 0)).toISOString();
}

// ------------------------------------------------------------- first week ----

/** The four first steps, each a real thing the account either has or hasn't done, with where to do it. */
export const FIRST_STEPS = [
  { id: "connect", label: "Connect a social account", href: "/settings#accounts" },
  { id: "plan", label: "Make your first Content Plan", href: "/plan" },
  { id: "video", label: "Rate a video or make one", href: "/studio" },
  { id: "schedule", label: "Schedule your first post", href: "/create" },
] as const;
export type FirstStepId = (typeof FIRST_STEPS)[number]["id"];
export type FirstSignals = Record<FirstStepId, boolean>;

/** The checklist is offered for this long after the account is made. */
export const FIRST_WEEK_WINDOW_DAYS = 30;
/** After the last step, the finished list stays up this long so the reward is seen. */
export const FIRST_WEEK_DONE_DAYS = 7;

export type FirstWeek = { show: boolean; steps: { id: FirstStepId; label: string; href: string; done: boolean }[]; done: boolean; left: number };

/**
 * The first-week list for an account made at `createdAt`. Shown to a new
 * account until every step is done (and for a few days after, with the
 * reward), and never to an older account that didn't finish.
 */
export function firstWeek(signals: FirstSignals, createdAt: string | null | undefined, rewardedAt: string | null | undefined, now: Date = new Date()): FirstWeek {
  const steps = FIRST_STEPS.map((s) => ({ ...s, done: signals[s.id] === true }));
  const left = steps.filter((s) => !s.done).length;
  const done = left === 0;
  const age = createdAt ? now.getTime() - new Date(createdAt).getTime() : Infinity;
  const isNew = age < FIRST_WEEK_WINDOW_DAYS * DAY;
  const justRewarded = Boolean(rewardedAt) && now.getTime() - new Date(rewardedAt as string).getTime() < FIRST_WEEK_DONE_DAYS * DAY;
  return { show: done ? justRewarded : isNew, steps, done, left };
}

/** Whether finishing the list earns the perk now: every step done, a new account, and not rewarded before. */
export const firstWeekRewardDue = (fw: FirstWeek, createdAt: string | null | undefined, rewardedAt: string | null | undefined, now: Date = new Date()): boolean =>
  fw.done && !rewardedAt && Boolean(createdAt) && now.getTime() - new Date(createdAt as string).getTime() < FIRST_WEEK_WINDOW_DAYS * DAY;

// ----------------------------------------------------------------- streak ----

/** Weeks in a row that earn the perk. */
export const STREAK_GOAL = 4;
/** How many recent weeks the strip shows. */
export const STREAK_STRIP = 8;

/** The Monday (UTC) that starts the week `d` is in, as a day number. */
const weekIndex = (d: Date): number => Math.floor((d.getTime() / DAY + 3) / 7); // 1970-01-01 was a Thursday

export type Streak = {
  /** Weeks in a row with at least one post published through SOCIA, ending this week or last week. */
  weeks: number;
  /** The last STREAK_STRIP weeks, oldest first: whether each had a published post. */
  strip: boolean[];
  /** Whether this week already has one. */
  thisWeek: boolean;
};

/**
 * The posting streak from the times posts were published through SOCIA. A
 * week without a post yet doesn't break the streak until it is over: the
 * count runs back from this week if it has a post, else from last week.
 */
export function streakFrom(published: (string | null | undefined)[], now: Date = new Date()): Streak {
  const cur = weekIndex(now);
  const weeks = new Set(published.filter((p): p is string => Boolean(p)).map((p) => weekIndex(new Date(p))).filter((w) => Number.isFinite(w) && w <= cur));
  const thisWeek = weeks.has(cur);
  let n = 0;
  for (let w = thisWeek ? cur : cur - 1; weeks.has(w); w--) n++;
  const strip = Array.from({ length: STREAK_STRIP }, (_, i) => weeks.has(cur - (STREAK_STRIP - 1 - i)));
  return { weeks: n, strip, thisWeek };
}

/** Whether the streak earns the perk now: at the goal, and not rewarded in the last four weeks. */
export const streakRewardDue = (s: Streak, rewardedAt: string | null | undefined, now: Date = new Date()): boolean =>
  s.weeks >= STREAK_GOAL && (!rewardedAt || now.getTime() - new Date(rewardedAt).getTime() >= STREAK_GOAL * 7 * DAY);
