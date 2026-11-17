// How many posts a week's plan has, and of which kind: filmed (the person on
// camera) or animated (SOCIA draws it, no filming). Noah, 2026-11-14: a new
// plan follows the account's own way of posting, the mix of its last plan,
// unless the person changes it; an account built on animated videos is asked
// how many posts it wants and whether to add on-camera videos, every other
// account how many of each. An account that gave SIO a posting target (days a
// week, lib/routine.ts) starts from that number instead, in the same
// proportions. Pure; the loaders are in ./planMixLoad.ts.
import { animatedPerDay, type AnimatedPref } from "./animated/fitCore";

/** At most this many of either kind in one week. */
export const MIX_MAX = 14;

export type PlanMix = {
  onCamera: number;
  animated: number;
  /** The account is built on animated videos: the form asks for a number of posts and whether to add on-camera ones. */
  animatedLed: boolean;
  /** Where the numbers came from, so the form can say so. */
  from: "last_plan" | "settings" | "routine" | "default";
  /** The posting target the numbers start from (days a week), when `from` is "routine". */
  target?: number;
};

/** Counts the kinds in a saved plan's posts. */
export function mixOfPlan(items: { animated?: boolean }[]): { onCamera: number; animated: number } {
  const animated = items.filter((i) => i.animated).length;
  return { onCamera: items.length - animated, animated };
}

const led = (onCamera: number, animated: number) => animated > 0 && animated >= onCamera;
const clampN = (n: number) => Math.max(0, Math.min(MIX_MAX, Math.round(n)));

/**
 * The mix a new plan starts from: the last plan's when there is one (the
 * account's own way of posting), otherwise the brand's settings (animated
 * videos on: one or two a day) and its strategy's pace for filmed posts.
 *
 * A posting target (the days a week the person told SIO they will post) sets
 * the number of posts: the last plan's kinds in the same proportions, or the
 * animated setting on that many days. A last plan with more than one post a
 * day is left as it is, because days a week cannot say how many posts that is.
 */
export function defaultMix(opts: { lastPlan?: { animated?: boolean }[] | null; animatedPref?: AnimatedPref | null; pace?: number | null; animatedAllowed?: boolean; target?: number | null }): PlanMix {
  const allowed = opts.animatedAllowed !== false;
  const target = typeof opts.target === "number" && opts.target >= 1 ? Math.min(7, Math.round(opts.target)) : 0;
  const last = opts.lastPlan?.length ? mixOfPlan(opts.lastPlan) : null;
  if (last) {
    const onCamera = clampN(last.onCamera);
    const animated = allowed ? clampN(last.animated) : 0;
    const total = onCamera + animated;
    if (total > 0 && target && total <= 7 && total !== target) {
      const a = Math.round((target * animated) / total);
      return { onCamera: target - a, animated: a, animatedLed: led(target - a, a), from: "routine", target };
    }
    if (total > 0) return { onCamera, animated, animatedLed: led(onCamera, animated), from: "last_plan" };
  }
  const perDay = allowed ? animatedPerDay(opts.animatedPref) : 0;
  const animated = clampN(perDay * (target || 7));
  const pace = opts.pace && opts.pace > 0 ? clampN(opts.pace) : 5;
  // A brand that turned animated videos on and has no plan yet starts animated-led, with no filmed posts until it adds them.
  const onCamera = animated ? 0 : target || pace;
  const from = target ? "routine" : perDay ? "settings" : "default";
  return { onCamera, animated, animatedLed: led(onCamera, animated), from, ...(target ? { target } : {}) };
}

/**
 * The numbers a person asked for, made safe: whole numbers from 0 to MIX_MAX,
 * no animated posts when the plan has no animated videos, and at least one
 * post. Anything missing or unreadable falls back to `fallback`.
 */
export function resolveMix(asked: { onCamera?: unknown; animated?: unknown }, fallback: PlanMix, animatedAllowed: boolean): { onCamera: number; animated: number } {
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? clampN(v) : d);
  let onCamera = num(asked.onCamera, fallback.onCamera);
  const animated = animatedAllowed ? num(asked.animated, fallback.animated) : 0;
  if (onCamera + animated === 0) onCamera = 1;
  return { onCamera, animated };
}

/**
 * Which day and slot each of `n` animated posts goes on: spread across the
 * week (three posts: Monday, Wednesday, Friday), a second a day once there are
 * more than seven. Pure.
 */
export function animatedSlots(n: number): { weekday: number; slot: 1 | 2 }[] {
  const count = clampN(n);
  const firsts = Math.min(count, 7);
  const days = Array.from({ length: firsts }, (_, i) => Math.floor((i * 7) / firsts));
  const out: { weekday: number; slot: 1 | 2 }[] = days.map((weekday) => ({ weekday, slot: 1 }));
  for (let i = 0; i < count - 7; i++) out.push({ weekday: Math.floor((i * 7) / (count - 7)), slot: 2 });
  return out.sort((a, b) => a.weekday - b.weekday || a.slot - b.slot);
}
