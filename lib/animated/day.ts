// The day label of an animated plan post: "Monday (animated)", or "Monday
// (animated 2)" for the second that day. Saved as the post's plan_day, so an
// animated post never gets mixed up with that day's filmed post. Pure and
// client-safe.

export const WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export const animatedDay = (weekday: string, slot: 1 | 2) => `${weekday} (animated${slot === 2 ? " 2" : ""})`;

/** True when a day label or saved plan_day belongs to an animated post. */
export const isAnimatedDay = (day: string | null | undefined) => /\(animated( 2)?\)\s*$/i.test(day ?? "");

/**
 * When an animated post goes out, from the audience's best hour that day (the
 * filmed post's hour): the first a few hours before it, the second a little
 * after, so neither lands on top of the filmed post.
 */
export function animatedHour(best: number, slot: 1 | 2): number {
  const h = slot === 2 ? Math.min(22, Math.max(9, best + 2)) : Math.min(21, Math.max(8, best - 5));
  return h === best ? (slot === 2 ? Math.max(9, best - 2) : Math.min(21, best + 3)) : h;
}

/** A day label as people read it: "Monday, animated" / "Monday, second animated"; other days unchanged. */
export const readableDay = (day: string) => day.replace(/\s*\(animated( 2)?\)\s*$/i, (_, two) => (two ? ", second animated" : ", animated"));

/** The weekday of an animated day label: "Monday" for "Monday (animated 2)". */
export const weekdayOf = (day: string) => day.replace(/\s*\(animated( 2)?\)\s*$/i, "");
