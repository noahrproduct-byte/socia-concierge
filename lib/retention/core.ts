// Cancelling a plan (Noah, 2026-11-15): before a person goes on to cancel,
// they say why (one of REASONS, required), and they are offered a little more
// for staying. The offer is extra AI credits, not a discount: it costs SOCIA
// at most BOOST_CAP_USD of AI, once per BOOST_EVERY_DAYS, and the plan's
// price doesn't change. Whatever they choose, cancelling stays one
// click away and is finished on Stripe's own page. Pure and browser-safe.

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

/**
 * What a person who stays gets: AI credits added once to their balance. AI
 * features are paid from one credit balance (lib/credits), so the offer is
 * credits; like a top-up they don't expire at the end of the month. 450
 * credits is what BOOST_CAP_USD of AI costs SOCIA at the credit margin.
 */
export const STAY_CREDITS = 450;
/** The offer in words. */
export const STAY_WORDS = `${STAY_CREDITS} extra AI credits`;
/** How long the month's AI ceiling has the extra room, so the credits can be used. */
export const BOOST_DAYS = 30;
/** Room added to the month's AI ceiling while that is on. */
export const BOOST_CAP_USD = 3;
/** The offer is made at most this often to one account, so it can't be collected by starting to cancel every month. */
export const BOOST_EVERY_DAYS = 180;

const DAY = 86_400_000;

/** Whether the stay offer can be made to an account that last took it at `givenAt`. */
export const canOfferBoost = (givenAt: string | null | undefined, now: Date = new Date()): boolean =>
  !givenAt || now.getTime() - new Date(givenAt).getTime() >= BOOST_EVERY_DAYS * DAY;

/** Whether a boost that runs until `until` is on at `now`. */
export const boostLive = (until: string | null | undefined, now: Date = new Date()): boolean => Boolean(until) && new Date(until as string).getTime() > now.getTime();
