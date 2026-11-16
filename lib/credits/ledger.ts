// Credits on the server: balance, the monthly grant, spend, refund and
// top-up, each one call to a locking function in supabase/ai-studio.sql.
// Service role only; every caller has already checked who is asking.
import { createServiceClient } from "@/lib/supabase/service";
import { monthKey } from "@/lib/aiSpend";
import { planCredits } from "./config";
import { bonusCredits } from "@/lib/referrals/core";
import type { PlanId } from "@/lib/plans";

/** What a spend paid for: a Clipper or AI Studio job, or one AI action (an Ask SOCIA answer, a rating...). */
export type CreditRef = { kind: "clip_job" | "generation_job" | "action"; id: string };

export class CreditsError extends Error {
  constructor(public code: "insufficient_credits" | "unavailable", message: string, public balance: number | null = null) {
    super(message);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Svc = any;

const svcOrThrow = (): Svc => {
  const svc = createServiceClient();
  if (!svc) throw new CreditsError("unavailable", "Credits are unavailable right now (server key missing).");
  return svc;
};

const isMissing = (e: { message?: string; code?: string } | null | undefined) =>
  Boolean(e && (e.code === "42P01" || e.code === "PGRST202" || /does not exist|Could not find/i.test(e.message ?? "")));

/** Who the credits are for: a plan, or an account's entitlements (its plan, invitations and the price it pays). */
export type CreditPlan = PlanId | { plan: PlanId; invites?: number; priceCents?: number | null };

/** This month's credits: the plan's for the price paid (lib/credits/config.ts), plus what counting invitations add (lib/referrals/core.ts). */
export function monthlyCredits(who: CreditPlan, invites = 0): number {
  const w = typeof who === "string" ? { plan: who, invites, priceCents: null } : who;
  return planCredits(w.plan, w.priceCents) + bonusCredits(w.invites ?? invites);
}

/**
 * The owner's balance after this month's credits have been granted (the
 * grant is idempotent, so reading the balance is also what fills it on the
 * first of the month; with supabase/credits-monthly.sql it also expires last
 * month's unused credits and tops the month up after an upgrade). null when
 * the credit tables are not installed.
 */
export async function creditBalance(ownerId: string, who: CreditPlan, now = new Date(), invites = 0): Promise<number | null> {
  const svc = svcOrThrow();
  const allowance = monthlyCredits(who, invites);
  const { data, error } = await svc.rpc("socia_credit_grant", { p_user: ownerId, p_amount: allowance, p_month: monthKey(now) });
  if (error) {
    if (isMissing(error)) return null;
    throw new CreditsError("unavailable", `Credits could not be read: ${error.message}`);
  }
  return typeof data === "number" ? data : Number(data ?? 0);
}

/** Take credits for a job. Throws CreditsError("insufficient_credits") with the balance when short. */
export async function spendCredits(ownerId: string, amount: number, ref: CreditRef, note?: string): Promise<number> {
  const svc = svcOrThrow();
  const { data, error } = await svc.rpc("socia_credit_spend", { p_user: ownerId, p_amount: amount, p_ref_kind: ref.kind, p_ref_id: ref.id, p_note: note ?? null });
  if (error) {
    if (/insufficient_credits/.test(error.message ?? "")) {
      const bal = Number(/balance (\d+)/.exec(error.details ?? error.message ?? "")?.[1] ?? NaN);
      throw new CreditsError("insufficient_credits", "Not enough credits for this.", Number.isFinite(bal) ? bal : null);
    }
    throw new CreditsError("unavailable", `Credits could not be spent: ${error.message}`);
  }
  return Number(data ?? 0);
}

/** Give a failed job's credits back. Idempotent; never throws (the job's failure is already recorded). */
export async function refundCredits(ownerId: string, ref: CreditRef, note?: string): Promise<number | null> {
  const svc = createServiceClient();
  if (!svc) return null;
  const { data, error } = await svc.rpc("socia_credit_refund", { p_user: ownerId, p_ref_kind: ref.kind, p_ref_id: ref.id, p_note: note ?? null });
  if (error) {
    console.error("[credits] refund failed:", error.message);
    return null;
  }
  return Number(data ?? 0);
}

/** A paid top-up, keyed by the Stripe payment so a retried webhook adds it once. */
export async function topupCredits(ownerId: string, amount: number, paymentId: string, note?: string): Promise<number> {
  const svc = svcOrThrow();
  const { data, error } = await svc.rpc("socia_credit_topup", { p_user: ownerId, p_amount: amount, p_payment_id: paymentId, p_note: note ?? null });
  if (error) throw new CreditsError("unavailable", `Top-up could not be recorded: ${error.message}`);
  return Number(data ?? 0);
}

export type LedgerEntry = { id: number; kind: string; amount: number; balance_after: number; ref_kind: string | null; ref_id: string | null; note: string | null; created_at: string };

/** The owner's last movements, newest first. */
export async function recentLedger(client: Svc, ownerId: string, limit = 20): Promise<LedgerEntry[]> {
  const { data, error } = await client
    .from("credit_ledger")
    .select("id, kind, amount, balance_after, ref_kind, ref_id, note, created_at")
    .eq("user_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as LedgerEntry[];
}
