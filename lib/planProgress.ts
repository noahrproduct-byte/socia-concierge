// What the server tells the Content Plan page while a plan is being built, as
// it happens (app/api/generate/route.ts streams these, one JSON object a
// line). Every step is a real stage of the work, never a timer. Pure; shared
// by the server and the page.

export type PlanStep = "ideas" | "fit" | "posts" | "animated" | "saving";

export type PlanEvent =
  | { type: "step"; step: PlanStep; state: "active" | "done" }
  /** What the plan found to build on: real counts from loadEvidence. */
  | { type: "found"; competitors: number; reels: number; posts: number }
  /** The strategist has started this many of the week's filmed posts. */
  | { type: "posts"; started: number; total: number }
  | { type: "done"; data: unknown; saved: unknown; usage: unknown }
  | { type: "error"; status: number; body: unknown };

/** How many of the week's posts the strategist has started, read from its JSON as it arrives. */
export function postsStarted(partialJson: string): number {
  const at = partialJson.indexOf('"weeklyPlan"');
  if (at < 0) return 0;
  return (partialJson.slice(at).match(/"day"\s*:/g) ?? []).length;
}

/** The middle of the account's earlier build times in seconds, or null with fewer than two. */
export function typicalSeconds(times: (number | null | undefined)[]): number | null {
  const xs = times.filter((t): t is number => typeof t === "number" && t > 0).sort((a, b) => a - b);
  if (xs.length < 2) return null;
  const m = Math.floor(xs.length / 2);
  return Math.round(xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2);
}
