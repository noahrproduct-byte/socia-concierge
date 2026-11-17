// SIO's weekly check-in (Noah's SIO brief, 2026-11-16): once a week SIO asks
// how the routine felt, and may suggest one change to the posting target.
// It only ever suggests. A target changes when the person presses the button
// that says so, and then from the following Monday (lib/postingStreak.ts).
// Nothing here pushes anyone to post more: "I can do more" is the only
// answer that leads to a higher target, and only after a week that met the
// current one. Pure and browser-safe.
import { addDays, weekStartOf } from "./postingStreak";
import { MAX_POST_DAYS, MIN_POST_DAYS } from "./routine";

export const FEELS = [
  { id: "too_much", label: "Too much" },
  { id: "right", label: "Just right" },
  { id: "more", label: "I can do more" },
] as const;
export type Feel = (typeof FEELS)[number]["id"];

/**
 * Whether today is a day SIO asks, and about which week. Friday to Sunday it
 * asks about the week ending; on Monday about the week just ended. Midweek it
 * doesn't ask: the week isn't far enough along to judge.
 */
export function checkinDue(today: string): { week: string; phrase: "this week" | "last week" } | null {
  const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  if (dow >= 4) return { week: weekStartOf(today), phrase: "this week" };
  if (dow === 0) return { week: addDays(weekStartOf(today), -7), phrase: "last week" };
  return null;
}

export type Suggestion = {
  /** What SIO says back. */
  say: string;
  /** A new posting target SIO offers, for the person to accept or leave. Null when it offers none. */
  offer: number | null;
};

const days = (n: number) => `${n} posting ${n === 1 ? "day" : "days"} a week`;

/**
 * What SIO says to an answer. `met` is whether the week asked about reached
 * the posting target (null when SOCIA can't tell yet).
 */
export function checkinSuggestion(feel: Feel, postDays: number | null | undefined, met: boolean | null): Suggestion {
  const n = postDays ?? null;
  if (feel === "right") return { say: "Good. I'll keep your week as it is.", offer: null };
  if (feel === "too_much") {
    if (n && n > MIN_POST_DAYS) return { say: `That's useful to know. Want to lower your target to ${days(n - 1)}? It would start next Monday. You can also move a filming day in Settings.`, offer: n - 1 };
    return { say: "That's useful to know. You can move a filming day or change what you make in Settings, under Growth Profile.", offer: null };
  }
  // "I can do more": offered only on the back of a week that met the target.
  if (n && n < MAX_POST_DAYS && met === true) return { say: `You met your target of ${days(n)}. Want to try ${days(n + 1)}? It would start next Monday.`, offer: n + 1 };
  if (n && n < MAX_POST_DAYS) return { say: `Good to hear. Once a week meets your target of ${days(n)}, I'll offer the next step up. You can also raise it any time in Settings.`, offer: null };
  return { say: "Good to hear. You're already posting every day, so there's nothing to raise.", offer: null };
}
