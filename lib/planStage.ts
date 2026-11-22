// Where one planned video has got to on its way out: planned, filmed, edited,
// posted. "Filmed" and "edited" are the person's own word (the plan item's
// `made` mark); "posted" is read from the Calendar (scheduled or published).
import type { PlanMade } from "./schema";

export const PLAN_STEPS = ["Plan", "Film", "Edit", "Post"] as const;
/** How many of the four steps are done: 1 planned, 2 filmed, 3 edited, 4 scheduled or posted. */
export type PlanStage = 1 | 2 | 3 | 4;

const POSTED = new Set(["scheduled", "publishing", "published"]);

export function planStage(item: { made?: PlanMade | null }, calendarState?: string | null): PlanStage {
  if (calendarState && POSTED.has(calendarState)) return 4;
  if (item.made?.step === "edited") return 3;
  if (item.made?.step === "filmed") return 2;
  return 1;
}

/** One word for the stage, for its chip. */
export const stageWord = (stage: PlanStage, calendarState?: string | null): string =>
  stage === 4 ? (calendarState === "published" ? "Posted" : "Scheduled") : stage === 3 ? "Edited" : stage === 2 ? "Filmed" : "Planned";

/** The question the Dashboard asks about a video at this stage. */
export const stageAsk = (stage: PlanStage, day: string): string =>
  stage === 1 ? `Planned for ${day}. Did you film it?` : stage === 2 ? "Filmed. Edit it next." : stage === 3 ? "Edited. Build the post and pick a day." : "On your Calendar.";

/** The post builder opened with a plan item's hook and concept, tied back to its plan day. */
export function postBuilderHref(planId: string | null, post: { day: string; concept: string; hook: string }): string {
  const q = new URLSearchParams();
  q.set("caption", `${post.hook.trim()}\n\n${post.concept.trim()}`);
  if (planId) q.set("planId", planId);
  q.set("planDay", post.day);
  q.set("from", "plan");
  return `/create?${q.toString()}`;
}

/** One planned video on the Dashboard: where it is and what comes next. */
export type PlanRow = { index: number; title: string; day: string; stage: PlanStage; animated: boolean };
