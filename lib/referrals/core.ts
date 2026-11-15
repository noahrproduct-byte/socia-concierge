// Invite a friend: the rules, in one place. Someone who signs up through a
// person's invite link and connects a social account counts as an invitation
// for 30 days; while it counts, BOTH people get a little more allowance and
// the room in their month's AI ceiling to use it. Small on purpose: an
// invitation costs SOCIA at most BONUS_CAP_USD per person, and brings in an
// account that has already connected. Pure and browser-safe.
import type { MeterKey, PlanConfig } from "@/lib/plans";

/** What one counting invitation adds to a person's month. */
export const BONUS_PER_INVITE: Partial<Record<MeterKey, number>> = { ask_socia: 10, content_plan: 1 };
/** How many invitations can count at once. */
export const MAX_ACTIVE = 5;
/** How long an invitation counts after the invited person connects an account. */
export const BONUS_DAYS = 30;
/** Room added to the month's AI ceiling per counting invitation, so the extra allowance can be used. */
export const BONUS_CAP_USD = 0.5;
/** Credits one counting invitation adds to the month (what BONUS_CAP_USD buys at the credit margin, lib/credits/config.ts). */
export const BONUS_CREDITS_PER_INVITE = 75;
/** An invite link must be used within this many days of the new account being made. */
export const CLAIM_WINDOW_DAYS = 7;
/** An invitation that hasn't counted after this long is no longer waited for. */
export const PENDING_DAYS = 60;

export const CODE_RE = /^[a-z0-9]{6,12}$/;
/** A code as typed or pasted, or null when it isn't one. */
export const cleanCode = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return CODE_RE.test(s) ? s : null;
};

// No 0/o, 1/l/i: a code read out loud or copied by hand stays unambiguous.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
/** An eight-character code from random bytes. */
export function makeCode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < 8; i++) out += ALPHABET[(bytes[i] ?? 0) % ALPHABET.length];
  return out;
}

export type ReferralRow = { referrer_id: string; referred_id: string; created_at: string; qualified_at: string | null };
export type Bonus = { active: number; until: string | null; pending: boolean };
export const NO_BONUS: Bonus = { active: 0, until: null, pending: false };

const DAY = 86_400_000;

/**
 * What `userId` has from these invitations right now: one for each friend
 * they invited who counts, plus one for having been invited themselves, up to
 * MAX_ACTIVE. `until` is when the last of them stops counting. `pending` is
 * whether an invitation is still waiting for its friend to connect an account.
 */
export function bonusFor(rows: ReferralRow[], userId: string, now: Date = new Date()): Bonus {
  const mine = rows.filter((r) => r.referrer_id === userId || r.referred_id === userId);
  const live = mine
    .filter((r) => r.qualified_at && now.getTime() - new Date(r.qualified_at).getTime() < BONUS_DAYS * DAY)
    .sort((a, b) => new Date(b.qualified_at as string).getTime() - new Date(a.qualified_at as string).getTime())
    .slice(0, MAX_ACTIVE);
  const pending = mine.some((r) => !r.qualified_at && now.getTime() - new Date(r.created_at).getTime() < PENDING_DAYS * DAY);
  if (!live.length) return { active: 0, until: null, pending };
  const last = Math.max(...live.map((r) => new Date(r.qualified_at as string).getTime()));
  return { active: live.length, until: new Date(last + BONUS_DAYS * DAY).toISOString(), pending };
}

/** Whether a saved bonus still counts at `now`. */
export const bonusLive = (b: Pick<Bonus, "active" | "until"> | null | undefined, now: Date = new Date()): number =>
  b && b.active > 0 && b.until && new Date(b.until).getTime() > now.getTime() ? Math.min(MAX_ACTIVE, Math.floor(b.active)) : 0;

/** A plan's allowances with `active` counting invitations added. A meter the plan doesn't include (0) stays 0. */
export function withBonus(config: PlanConfig, active: number): PlanConfig {
  if (active <= 0) return config;
  const meters = { ...config.meters };
  for (const [k, n] of Object.entries(BONUS_PER_INVITE) as [MeterKey, number][]) if (meters[k] > 0) meters[k] += n * active;
  return { ...config, meters };
}

/** The credits `active` counting invitations add to the month. */
export const bonusCredits = (active: number): number => Math.max(0, Math.min(MAX_ACTIVE, active)) * BONUS_CREDITS_PER_INVITE;

/** The room `active` counting invitations add to the month's AI ceiling, in dollars. */
export const bonusCapUsd = (active: number): number => Math.max(0, Math.min(MAX_ACTIVE, active)) * BONUS_CAP_USD;

/** Whether an account made at `createdAt` can still use an invite link. */
export const canClaim = (createdAt: string | null | undefined, now: Date = new Date()): boolean =>
  Boolean(createdAt) && now.getTime() - new Date(createdAt as string).getTime() < CLAIM_WINDOW_DAYS * DAY;

/** The reward in words, for the screen. */
export const REWARD_WORDS = `${BONUS_CREDITS_PER_INVITE} extra AI credits a month`;
