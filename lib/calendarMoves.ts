// Moving and deleting drafts on the Calendar. A draft (an idea, or a post
// without its video yet) can be dropped on another day: it keeps its time of
// day, and a post going out on several days keeps the gaps between them.
// Scheduled and published posts are not moved here (Create Post handles
// those, with their media and platform uploads). Pure.

const DAY = 24 * 60 * 60 * 1000;

/** Local midnight of a date. */
export const dayStart = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Whole local days from `from`'s day to `to`'s day (DST-safe). */
export function dayShift(from: Date, to: Date): number {
  return Math.round((dayStart(to).getTime() - dayStart(from).getTime()) / DAY);
}

/** The same local time of day, `days` later (or earlier). */
export function shiftDays(iso: string, days: number): string {
  const d = new Date(iso);
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes(), d.getSeconds());
  return out.toISOString();
}

/** Only drafts move or delete from the grid. */
export function isMovableDraft(p: { status: string; destinations?: { status: string }[] }): boolean {
  if (p.status !== "draft") return false;
  return (p.destinations ?? []).every((d) => d.status === "draft" || d.status === "cancelled");
}

/** Why a draft can't go to this day, or null when it can. */
export function moveProblem(target: Date, now: Date): string | null {
  return dayStart(target).getTime() < dayStart(now).getTime() ? "That day has passed. Pick today or a later day." : null;
}
