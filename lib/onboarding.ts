// Onboarding steps and the rule that decides whether a brand still needs
// them. Pure, so the gate in the app layout and the wizard agree.

// Kept short on purpose: SOCIA reads what it can from the connected
// accounts, the person confirms it and sets one main goal with a target, then
// watches SOCIA build the strategy for it, sees that strategy and chooses the
// plan to follow it with (Noah, 2026-11-15). Between the goal and the
// strategy SIO asks about the person's routine: posting days, filming days,
// how they work, what they make and when they publish (Noah's SIO brief,
// 2026-11-16; lib/routine.ts). The detailed questions (audience, voice,
// resources) are optional, in Settings.
export const STEPS = ["connect", "profile", "goal", "routine", "strategy", "plan"] as const;
export type Step = (typeof STEPS)[number];

export const STEP_LABEL: Record<Step, string> = {
  connect: "Connect",
  profile: "Your account",
  goal: "Your goals",
  routine: "Your routine",
  strategy: "Your strategy",
  plan: "Your plan",
};

export const isStep = (v: unknown): v is Step => typeof v === "string" && (STEPS as readonly string[]).includes(v);
export const nextStep = (s: Step): Step => STEPS[Math.min(STEPS.indexOf(s) + 1, STEPS.length - 1)];
export const prevStep = (s: Step): Step => STEPS[Math.max(STEPS.indexOf(s) - 1, 0)];

export type OnboardingRow = { step: string; answers: Record<string, unknown> | null; completed_at: string | null };

/**
 * Whether the app should send this person to /onboarding before anything
 * else (Noah, 2026-10-29: onboarding is required).
 *
 * - Only the brand's owner is sent; an invited Admin or Member works in
 *   someone else's brand and never sets it up.
 * - A brand with a progress row needs it until the row is completed.
 * - A brand without one (set up before progress was saved, or before the
 *   table exists) needs it only when it has no niche, the old rule: people
 *   who finished the earlier onboarding are not sent through it again.
 */
export function needsOnboarding(input: { isOwner: boolean; row: OnboardingRow | null; tableReady: boolean; niche: string | null }): boolean {
  if (!input.isOwner) return false;
  if (input.tableReady && input.row) return input.row.completed_at == null;
  return !input.niche;
}

/** Where to resume: the saved step, or the start. */
export function resumeStep(row: OnboardingRow | null): Step {
  // "briefing" was the last step before the strategy step replaced it: a brand left there resumes on the new last step.
  if (row?.step === "briefing") return "strategy";
  return row && isStep(row.step) ? row.step : "connect";
}
