// The person's own video ideas, typed on the Planner before a plan is built (Noah, 2026-11-23: "add a
// section before generating plan where users can type in any ideas that they have or videos that they
// wanna make"). Each idea becomes one filmed post of the week, in order, as far as the week's posts go;
// SOCIA writes the hook, shots and the rest around it. A post made from an idea is marked "Your idea"
// (source "own"), and any idea that didn't make it into the plan is said so, never dropped silently.
// Pure and browser-safe.

/** At most this many ideas are read (a week never holds more filmed posts). */
export const MAX_IDEAS = 7;
/** Characters per idea, and for the whole box. */
export const MAX_IDEA_CHARS = 300;
export const MAX_IDEAS_TEXT = 2400;

/** The ideas in the box: one per line, list markers and blank lines dropped, repeats removed. */
export function cleanIdeas(text: string | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of String(text ?? "").slice(0, MAX_IDEAS_TEXT).split(/\r?\n/)) {
    const idea = raw
      .replace(/^\s*(?:[-*\u2022\u2013]|\d{1,2}[.)])\s*/, "")
      .replace(/\s*\u2014\s*/g, ", ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_IDEA_CHARS);
    if (idea.length < 3) continue;
    const key = idea.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(idea);
    if (out.length >= MAX_IDEAS) break;
  }
  return out;
}

/** How many of the ideas fit this week's filmed posts (all of them when the count isn't fixed). */
export function ideasThatFit(ideas: string[], filmed: number | null | undefined): number {
  return filmed == null ? Math.min(ideas.length, MAX_IDEAS) : Math.max(0, Math.min(ideas.length, filmed));
}

/** The prompt block for the strategist, or "" when there are no ideas. */
export function ideasBlock(ideas: string[], filmed: number | null | undefined): string {
  const fit = ideasThatFit(ideas, filmed);
  if (!fit) return "";
  const listed = ideas.slice(0, fit);
  return [
    "\n# Videos the person wants to make this week (their own ideas)",
    ...listed.map((idea, k) => `${k + 1}. ${idea}`),
    `${fit === 1 ? "This idea is one post" : "Each of these ideas is one post"} in weeklyPlan: ${fit === 1 ? "it takes one" : `together they take ${fit}`} of the week's posts, and SOCIA's own ideas fill the rest. Keep what each idea is about and the person's own words for it in the title; don't swap it for a different topic or merge two ideas. Write everything else for it as for any post: the hook, the beats, the filming direction, the editing, the CTA and the evidence, which says honestly how much the account's data supports it (basis "experiment" or "thin" when nothing in the evidence does; the person chose it, so never call it proven). Set fromIdea to the idea's number; every other post has fromIdea 0.`,
  ].join("\n");
}

type WithIdea = { fromIdea?: unknown; source?: "socia" | "own" };

/**
 * The posts with the ideas they were made from marked as the person's own (source "own"), and the ideas
 * no post was made from. A number outside the list, or one already used, counts as SOCIA's idea. Pure.
 */
export function markIdeaPosts<T extends WithIdea>(items: T[], ideas: string[]): { items: (Omit<T, "fromIdea">)[]; left: string[] } {
  const used = new Set<number>();
  const out = items.map((item) => {
    const { fromIdea, ...rest } = item;
    const n = typeof fromIdea === "number" && Number.isInteger(fromIdea) ? fromIdea : 0;
    if (n >= 1 && n <= ideas.length && !used.has(n)) {
      used.add(n);
      return { ...rest, source: "own" as const };
    }
    return rest;
  });
  return { items: out, left: ideas.filter((_, k) => !used.has(k + 1)) };
}
