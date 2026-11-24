// What the person wants from AI Studio's ideas (Step 1, Ideate). Each goal
// changes what SOCIA reads and what it asks the writer for; the brand profile
// is always read, so nobody types their business in again. Pure, browser-safe.

export type StudioGoal = "ideas" | "improve" | "trending" | "views" | "customers" | "best";

export const STUDIO_GOALS: { id: StudioGoal; label: string; hint: string }[] = [
  { id: "ideas", label: "Content ideas", hint: "Fresh ideas for your brand." },
  { id: "views", label: "More views", hint: "Hooks that stop the scroll and keep people watching." },
  { id: "customers", label: "More customers", hint: "Posts that lead to a visit, an order or a booking." },
  { id: "best", label: "More like my best posts", hint: "Built on what already worked for you." },
  { id: "trending", label: "Recreate a trending Reel", hint: "A format that took off in your niche, made yours." },
  { id: "improve", label: "Improve my idea", hint: "Paste an idea or script and SOCIA makes it stronger." },
];

export const isStudioGoal = (v: unknown): v is StudioGoal => STUDIO_GOALS.some((g) => g.id === v);

/** What the writer is asked to put first for each goal. */
export const GOAL_BRIEF: Record<StudioGoal, string> = {
  ideas: "Write a varied set of ideas for this brand.",
  views: "Optimise for views and retention: the hook lands in the first second, the payoff comes late enough that people stay, and the idea is easy to share.",
  customers: "Optimise for customers: every idea shows what the brand sells or does at its best, gives a concrete reason to come in, order or book, and ends on one clear call to action. Never invent prices, offers or claims.",
  best: "Build on the account's own best posts listed below: keep what made them work (subject, format, hook style) and find a new angle, never a repeat.",
  trending: "Adapt the formats of the Reels that took off in the niche, listed below: keep each one's structure and hook pattern, change the subject, setting and words to this brand. Never copy their wording. Say which Reel each idea adapts.",
  improve: "The person wrote the draft below. Write improved versions of it: a stronger hook, a clearer single point, a better ending. Keep their idea and their facts; change how it is told.",
};
