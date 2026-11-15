// Cancelling a plan (Noah, 2026-11-15): before a person goes on to cancel,
// they say why (one of REASONS, required), and they are offered a little more
// for staying. The offer is extra allowance for 30 days, not a discount: it
// costs SOCIA at most BOOST_CAP_USD of AI, once per BOOST_EVERY_DAYS, and the
// plan's price doesn't change. Whatever they choose, cancelling stays one
// click away and is finished on Stripe's own page. Pure and browser-safe.
import { METER_UNIT, type MeterKey, type PlanConfig } from "@/lib/plans";

export const REASONS = [
  { id: "too_expensive", label: "It costs too much" },
  { id: "not_using", label: "I'm not using it enough" },
  { id: "missing_feature", label: "It's missing something I need" },
  { id: "results", label: "It didn't help my results" },
  { id: "hard_to_use", label: "It was hard to use" },
  { id: "switching", label: "I'm switching to another tool" },
  { id: "temporary", label: "I only needed it for a while" },
  { id: "other", label: "Something else" },
] as const;
export type ReasonId = (typeof REASONS)[number]["id"];
export const isReason = (v: unknown): v is ReasonId => REASONS.some((r) => r.id === v);
/** "Something else" has to say what; the rest may add a note. */
export const DETAIL_MAX = 500;
export const detailRequired = (reason: ReasonId): boolean => reason === "other";
export const cleanDetail = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, DETAIL_MAX) : "");

/** What a person who stays gets on top of their plan, for BOOST_DAYS. Only what their plan already includes. */
export const STAY_BOOST: Partial<Record<MeterKey, number>> = { ask_socia: 25, content_generation: 30, content_plan: 2, animated_videos: 10, voiceovers: 5 };
export const BOOST_DAYS = 30;
/** Room added to the month's AI ceiling while the boost is on, so the extras can be used. */
export const BOOST_CAP_USD = 3;
/** The offer is made at most this often to one account, so it can't be collected by starting to cancel every month. */
export const BOOST_EVERY_DAYS = 180;

const DAY = 86_400_000;

/** Whether the stay offer can be made to an account that last took it at `givenAt`. */
export const canOfferBoost = (givenAt: string | null | undefined, now: Date = new Date()): boolean =>
  !givenAt || now.getTime() - new Date(givenAt).getTime() >= BOOST_EVERY_DAYS * DAY;

/** Whether a boost that runs until `until` is on at `now`. */
export const boostLive = (until: string | null | undefined, now: Date = new Date()): boolean => Boolean(until) && new Date(until as string).getTime() > now.getTime();

/** A plan's allowances with the stay boost added. A meter the plan doesn't include (0) stays 0. */
export function withBoost(config: PlanConfig, on: boolean): PlanConfig {
  if (!on) return config;
  const meters = { ...config.meters };
  for (const [k, n] of Object.entries(STAY_BOOST) as [MeterKey, number][]) if (meters[k] > 0) meters[k] += n;
  return { ...config, meters };
}

const NAME: Partial<Record<MeterKey, { one: string; many: string }>> = {
  ask_socia: { one: "Ask SOCIA question", many: "Ask SOCIA questions" },
  content_generation: { one: "hook or caption", many: "hooks and captions" },
  content_plan: { one: "Content Plan", many: "Content Plans" },
};

/** The offer as lines for the screen, for this plan: only what it would really add. */
export function boostLines(config: PlanConfig): string[] {
  return (Object.entries(STAY_BOOST) as [MeterKey, number][])
    .filter(([k]) => config.meters[k] > 0)
    .map(([k, n]) => { const u = NAME[k] ?? METER_UNIT[k]; return `${n} more ${n === 1 ? u.one : u.many}`; });
}
