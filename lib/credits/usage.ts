// Usage snapshots for features paid with credits (lib/credits/config.ts):
// the balance and what one use costs replace the old per-feature count, so
// screens that read usage before an action show credits too. Server only.
import type { Entitlements, UsageSnapshot } from "@/lib/entitlements";
import type { MeterKey } from "@/lib/plans";
import { nextMonthStart } from "@/lib/aiSpend";
import { ACTION_USD, actionCredits, type CreditAction } from "./config";
import { creditBalance } from "./ledger";

/** `usage` with every credit-paid feature showing the credit balance. Unchanged when the credit tables aren't installed or can't be read. */
export async function withCredits(usage: Record<MeterKey, UsageSnapshot>, ent: Entitlements, now = new Date()): Promise<Record<MeterKey, UsageSnapshot>> {
  const balance = await creditBalance(ent.userId, ent, now).catch(() => null);
  if (balance == null) return usage;
  const resetsOn = nextMonthStart(now).toISOString().slice(0, 10);
  const out = { ...usage };
  for (const a of Object.keys(ACTION_USD) as CreditAction[]) {
    const cost = actionCredits(a);
    out[a] = { meter: a, used: null, limit: 0, remaining: Math.floor(balance / cost), resetsOn, credits: { balance, cost } };
  }
  return out;
}
